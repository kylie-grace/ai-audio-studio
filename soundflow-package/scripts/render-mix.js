/**
 * AI Audio Studio — Render Mix
 *
 * Bounce the current Pro Tools session to disk using a render profile
 * passed in from the AI Audio Studio render plan.
 *
 * @param {{ outputPath: string, target?: string, sampleRate?: number, bitDepth?: number }} params
 */
async function renderMix({ outputPath, target = 'streaming', sampleRate = 44100, bitDepth = 24 }) {
  if (!outputPath) throw new Error('outputPath is required');

  sf.ui.show(`AI Audio Studio: rendering mix to ${outputPath} (${target})`);

  await sf.app.proTools.bounceToFile({
    outputFile: outputPath,
    sampleRate: sampleRate,
    bitDepth: bitDepth,
    fileType: 'WAV',
    bounceSource: 'MainOutput',
    offlineBounce: true,
  });

  sf.ui.show(`Render complete: ${outputPath}`);
  return { status: 'complete', outputPath, target, sampleRate, bitDepth };
}
