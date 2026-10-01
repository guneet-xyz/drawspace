import { test, expect, type APIRequestContext } from '@playwright/test'

const origin = process.env.E2E_BASE_URL || 'http://localhost:3000'
const headers = { Origin: origin }
const password = 'testing-a-strong-password'

async function register(
  request: APIRequestContext,
  name: string,
  email: string,
) {
  const response = await request.post('/api/auth/register', {
    headers,
    data: { name, email, password },
  })
  expect(response.status()).toBe(201)
  return response.json()
}

test('accounts, tenant isolation, RBAC, saving, concurrency, sharing and revocation', async ({
  playwright,
}) => {
  const stamp = `${Date.now()}`
  const owner = await playwright.request.newContext({ baseURL: origin })
  const viewer = await playwright.request.newContext({ baseURL: origin })
  const outsider = await playwright.request.newContext({ baseURL: origin })
  const anonymous = await playwright.request.newContext({ baseURL: origin })
  const ownerUser = await register(owner, 'Owner', `owner-${stamp}@example.com`)
  const viewerUser = await register(
    viewer,
    'Viewer',
    `viewer-${stamp}@example.com`,
  )
  const outsiderUser = await register(
    outsider,
    'Outsider',
    `outsider-${stamp}@example.com`,
  )
  const [workspace] = await (await owner.get('/api/workspaces')).json()
  expect(
    (
      await owner.post(`/api/workspaces/${workspace.id}/members`, {
        headers,
        data: { email: viewerUser.email, role: 'viewer' },
      })
    ).status(),
  ).toBe(201)
  const created = await owner.post('/api/drawings', {
    headers,
    data: { workspaceId: workspace.id, title: 'Architecture sketch' },
  })
  const { id } = await created.json()
  expect(created.status()).toBe(201)
  expect((await outsider.get(`/api/drawings/${id}`)).status()).toBe(404)
  expect((await anonymous.get(`/api/drawings/${id}`)).status()).toBe(401)
  expect((await viewer.get(`/api/drawings/${id}`)).status()).toBe(200)
  expect(
    (
      await viewer.patch(`/api/drawings/${id}`, {
        headers,
        data: { version: 1, title: 'Nope' },
      })
    ).status(),
  ).toBe(403)
  expect(
    (await viewer.delete(`/api/drawings/${id}`, { headers })).status(),
  ).toBe(403)
  expect(
    (
      await viewer.post(`/api/drawings/${id}/shares`, {
        headers,
        data: { expiresInDays: 7 },
      })
    ).status(),
  ).toBe(403)
  expect(
    (
      await owner.patch(`/api/drawings/${id}`, {
        headers: { Origin: 'https://evil.example' },
        data: { version: 1, title: 'CSRF' },
      })
    ).status(),
  ).toBe(403)
  const scene = {
    elements: [],
    appState: { viewBackgroundColor: '#fff' },
    files: {
      image: {
        id: 'image',
        mimeType: 'image/png',
        dataURL: 'data:image/png;base64,aGVsbG8=',
        created: 1,
      },
    },
  }
  const saved = await owner.patch(`/api/drawings/${id}`, {
    headers,
    data: { version: 1, title: 'Saved sketch', scene },
  })
  expect(saved.status()).toBe(200)
  expect((await saved.json()).version).toBe(2)
  expect(
    (await (await owner.get(`/api/drawings/${id}`)).json()).scene.files.image
      .dataURL,
  ).toBe(scene.files.image.dataURL)
  expect(
    (
      await owner.patch(`/api/drawings/${id}`, {
        headers,
        data: { version: 1, title: 'Stale tab' },
      })
    ).status(),
  ).toBe(409)
  const shared = await owner.post(`/api/drawings/${id}/shares`, {
    headers,
    data: { expiresInDays: 7 },
  })
  expect(shared.status()).toBe(201)
  const share = await shared.json()
  expect((await anonymous.get(share.url)).status()).toBe(200)
  const shareListing = await (
    await owner.get(`/api/drawings/${id}/shares`)
  ).json()
  expect(shareListing[0]).not.toHaveProperty('token_hash')
  expect(
    (
      await owner.delete(`/api/drawings/${id}/shares/${share.id}`, { headers })
    ).status(),
  ).toBe(200)
  expect((await anonymous.get(share.url)).status()).toBe(404)
  expect(
    (
      await owner.patch(
        `/api/workspaces/${workspace.id}/members/${viewerUser.id}`,
        { headers, data: { role: 'editor' } },
      )
    ).status(),
  ).toBe(200)
  expect(
    (
      await viewer.patch(`/api/drawings/${id}`, {
        headers,
        data: { version: 2, title: 'Editor works' },
      })
    ).status(),
  ).toBe(200)
  expect(
    (
      await viewer.delete(`/api/workspaces/${workspace.id}`, { headers })
    ).status(),
  ).toBe(403)
  expect(
    (
      await owner.delete(
        `/api/workspaces/${workspace.id}/members/${ownerUser.id}`,
        { headers },
      )
    ).status(),
  ).toBe(403)
  expect(
    (
      await owner.patch(
        `/api/workspaces/${workspace.id}/members/${viewerUser.id}`,
        { headers, data: { role: 'owner' } },
      )
    ).status(),
  ).toBe(400)
  expect(
    (
      await owner.patch(
        `/api/workspaces/${workspace.id}/members/${viewerUser.id}`,
        { headers, data: { role: 'admin' } },
      )
    ).status(),
  ).toBe(200)
  expect(
    (
      await viewer.patch(
        `/api/workspaces/${workspace.id}/members/${viewerUser.id}`,
        { headers, data: { role: 'viewer' } },
      )
    ).status(),
  ).toBe(403)
  expect(
    (
      await viewer.delete(
        `/api/workspaces/${workspace.id}/members/${ownerUser.id}`,
        { headers },
      )
    ).status(),
  ).toBe(403)
  expect(
    (
      await viewer.post(`/api/workspaces/${workspace.id}/members`, {
        headers,
        data: { email: outsiderUser.email, role: 'admin' },
      })
    ).status(),
  ).toBe(403)
  expect(
    (
      await viewer.post(`/api/workspaces/${workspace.id}/members`, {
        headers,
        data: { email: outsiderUser.email, role: 'editor' },
      })
    ).status(),
  ).toBe(201)
  expect(
    (
      await viewer.patch(
        `/api/workspaces/${workspace.id}/members/${outsiderUser.id}`,
        { headers, data: { role: 'viewer' } },
      )
    ).status(),
  ).toBe(200)
  expect(
    (
      await owner.delete(
        `/api/workspaces/${workspace.id}/members/${viewerUser.id}`,
        { headers },
      )
    ).status(),
  ).toBe(200)
  expect((await viewer.get(`/api/drawings/${id}`)).status()).toBe(404)
  expect(
    (await owner.post('/api/auth/logout', { headers, data: {} })).status(),
  ).toBe(200)
  expect((await owner.get('/api/workspaces')).status()).toBe(401)
  expect(
    (
      await owner.post('/api/auth/login', {
        headers,
        data: { email: ownerUser.email, password: 'incorrect-password' },
      })
    ).status(),
  ).toBe(401)
  expect(
    (
      await owner.post('/api/auth/login', {
        headers,
        data: { email: ownerUser.email, password },
      })
    ).status(),
  ).toBe(200)
  const oldSession = await playwright.request.newContext({
    baseURL: origin,
    storageState: await owner.storageState(),
  })
  expect(
    (
      await owner.patch('/api/account', {
        headers,
        data: { name: 'Updated Owner' },
      })
    ).status(),
  ).toBe(200)
  const newPassword = 'a-different-strong-password'
  expect(
    (
      await owner.post('/api/account/password', {
        headers,
        data: { currentPassword: password, password: newPassword },
      })
    ).status(),
  ).toBe(200)
  expect((await oldSession.get('/api/workspaces')).status()).toBe(401)
  expect((await owner.get('/api/workspaces')).status()).toBe(200)
  expect(
    (
      await anonymous.post('/api/auth/login', {
        headers,
        data: { email: ownerUser.email, password: newPassword },
      })
    ).status(),
  ).toBe(200)
  await oldSession.dispose()
  await Promise.all([
    owner.dispose(),
    viewer.dispose(),
    outsider.dispose(),
    anonymous.dispose(),
  ])
})

test('signup UI and drawing editor save a renamed template', async ({
  page,
}) => {
  await page.goto('/signup')
  await page.getByLabel('Your name', { exact: true }).fill('Creative Tester')
  await page
    .getByLabel('Email address')
    .fill(`browser-${Date.now()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Your ideas live here' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'New drawing', exact: true }).click()
  await page
    .getByLabel('Drawing name', { exact: true })
    .fill('My browser sketch')
  await page.getByRole('button', { name: 'Simple flow' }).click()
  await page
    .getByRole('button', { name: 'Create drawing', exact: true })
    .click()
  await expect(page.locator('.excalidraw')).toBeVisible({ timeout: 60000 })
  await page.getByLabel('Drawing title').fill('Renamed browser sketch')
  await expect(page.getByRole('status')).toContainText('All changes saved', {
    timeout: 30000,
  })
  const drawingId = page.url().split('/').pop()
  const saved = await (
    await page.request.get(`/api/drawings/${drawingId}`)
  ).json()
  expect(saved.scene.elements.length).toBeGreaterThan(0)
  expect(saved.thumbnail).toMatch(/^data:image\/png;base64,/)
  await page.reload()
  await expect(page.getByLabel('Drawing title')).toHaveValue(
    'Renamed browser sketch',
  )
  await page.getByRole('button', { name: 'Back to drawings' }).click()
  await expect(
    page.getByRole('link', { name: 'Renamed browser sketch', exact: true }),
  ).toBeVisible()
})

test('guest canvas persists locally without a session', async ({ page }) => {
  await page.goto('/guest')
  await expect(page.locator('.excalidraw')).toBeVisible({ timeout: 60000 })
  await page.getByLabel('Drawing title').fill('A browser-only idea')
  const canvas = page.locator('canvas.interactive')
  await canvas.click({ position: { x: 350, y: 180 } })
  await page.keyboard.press('r')
  const bounds = (await canvas.boundingBox())!
  await page.mouse.move(bounds.x + 350, bounds.y + 180)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 500, bounds.y + 280, { steps: 8 })
  await page.mouse.up()
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(
          localStorage.getItem('drawspace:guest') || '{}',
        ).scene?.elements?.some(
          (e: { type: string }) => e.type === 'rectangle',
        ),
      ),
    )
    .toBe(true)
  await expect(page.getByRole('status')).toContainText('Saved in browser')
  await page.reload()
  await expect(page.getByLabel('Drawing title')).toHaveValue(
    'A browser-only idea',
  )
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === 'drawspace_session',
    ),
  ).toBe(false)
  await page.getByRole('link', { name: 'Create account', exact: true }).click()
  await page.getByLabel('Your name', { exact: true }).fill('Guest Importer')
  await page
    .getByLabel('Email address')
    .fill(`guest-import-${Date.now()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click()
  await page.getByRole('button', { name: 'Save guest sketch' }).click()
  await expect(page.getByLabel('Drawing title')).toHaveValue(
    'A browser-only idea',
  )
  await expect(page.getByRole('status')).toContainText('All changes saved')
  const id = page.url().split('/').pop()
  const saved = await (await page.request.get(`/api/drawings/${id}`)).json()
  expect(
    saved.scene.elements.some((e: { type: string }) => e.type === 'rectangle'),
  ).toBe(true)
})

test('shared drawing opens as a read-only editor without signing in', async ({
  page,
  playwright,
}) => {
  const owner = await playwright.request.newContext({ baseURL: origin })
  await register(owner, 'Sharing Tester', `sharing-${Date.now()}@example.com`)
  const [workspace] = await (await owner.get('/api/workspaces')).json()
  const { id } = await (
    await owner.post('/api/drawings', {
      headers,
      data: { workspaceId: workspace.id, title: 'A public idea' },
    })
  ).json()
  const share = await (
    await owner.post(`/api/drawings/${id}/shares`, {
      headers,
      data: { expiresInDays: 7 },
    })
  ).json()
  await page.goto(share.url)
  await expect(page.locator('.excalidraw')).toBeVisible()
  await expect(page.getByText('View only', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'A public idea' }),
  ).toBeVisible()
  await expect(page.getByLabel('Drawing title')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Share', exact: true }),
  ).toHaveCount(0)
  await owner.dispose()
})
