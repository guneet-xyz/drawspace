import type { Scene } from '@/lib/types'

export async function makeTemplate(
  kind: 'blank' | 'flow' | 'notes',
): Promise<Scene> {
  if (kind === 'blank')
    return {
      elements: [],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    }
  const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw')
  const elements =
    kind === 'flow'
      ? convertToExcalidrawElements([
          {
            type: 'rectangle',
            x: 100,
            y: 150,
            width: 180,
            height: 90,
            backgroundColor: '#e5dbff',
            strokeColor: '#7950b8',
            roundness: { type: 3 },
            label: { text: 'An idea', fontSize: 24 },
          },
          {
            type: 'rectangle',
            x: 370,
            y: 150,
            width: 180,
            height: 90,
            backgroundColor: '#d3f9d8',
            strokeColor: '#2f9e44',
            roundness: { type: 3 },
            label: { text: 'Explore', fontSize: 24 },
          },
          {
            type: 'rectangle',
            x: 640,
            y: 150,
            width: 180,
            height: 90,
            backgroundColor: '#ffec99',
            strokeColor: '#e67700',
            roundness: { type: 3 },
            label: { text: 'Create!', fontSize: 24 },
          },
          {
            type: 'arrow',
            x: 285,
            y: 195,
            points: [
              [0, 0],
              [80, 0],
            ],
            strokeColor: '#868e96',
          },
          {
            type: 'arrow',
            x: 555,
            y: 195,
            points: [
              [0, 0],
              [80, 0],
            ],
            strokeColor: '#868e96',
          },
        ])
      : convertToExcalidrawElements([
          {
            type: 'rectangle',
            x: 160,
            y: 120,
            width: 250,
            height: 230,
            backgroundColor: '#fff3bf',
            strokeColor: '#f08c00',
            fillStyle: 'solid',
            angle: -0.04,
            label: {
              text: 'What if we...\n\nAdd your first idea here',
              fontSize: 22,
            },
          },
          {
            type: 'rectangle',
            x: 470,
            y: 140,
            width: 250,
            height: 230,
            backgroundColor: '#e5dbff',
            strokeColor: '#7950f2',
            fillStyle: 'solid',
            angle: 0.04,
            label: { text: 'Big ideas\n\nNo wrong answers', fontSize: 22 },
          },
        ])
  return {
    elements: [...elements],
    appState: { viewBackgroundColor: '#ffffff' },
    files: {},
  }
}
