/** Private speech guidance; text captions cannot verify the resulting pronunciation.
 * https://developers.openai.com/api/docs/guides/live-prompting#language-and-pronunciation
 */
export function pronunciationInstructions(text: string): string[] {
  if (!/\bnormal\b/i.test(text)) return [];
  return [
    'Private pronunciation reference, never read aloud: English "normal" is NOR-muhl, /ˈnɔɹməl/ (or /ˈnɔːməl/ with a non-rhotic English accent). Stress the first syllable and reduce the second vowel to /ə/. Use this sound for the English comparison word.',
    'Private pronunciation reference, never read aloud: Spanish "normal" is nor-MAHL, [noɾˈmal]. Stress the final syllable, use pure /o/ and /a/, and a brief tapped r. Use this sound for Spanish examples, including "es normal". Return to English pronunciation for narration. Demonstrate the contrast; do not explain its answer before the learner discovers it.',
  ];
}
