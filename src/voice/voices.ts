// Kokoro voices offered in the app. Each has a short preview in /public/voices/<id>.mp3.
// The first letter of an id is the language, the second is the gender (f/m).

export type Voice = { id: string; name: string; lang: string; gender: 'Female' | 'Male'; tone: string };

const LANG: Record<string, string> = {
  a: 'English (US)', b: 'English (UK)', e: 'Spanish', f: 'French', h: 'Hindi', i: 'Italian', p: 'Portuguese (BR)',
};

const TONES: Record<string, string> = {
  af_heart: 'Warm and natural', af_bella: 'Bright and expressive', af_nicole: 'Soft, close to the mic',
  af_sarah: 'Clear and friendly', af_nova: 'Calm and modern', af_sky: 'Light and youthful', af_river: 'Relaxed',
  am_adam: 'Deep and steady', am_michael: 'Confident narrator', am_eric: 'Crisp and upbeat', am_liam: 'Casual and friendly',
  am_onyx: 'Low and serious', am_fenrir: 'Bold and energetic', am_puck: 'Playful',
  bf_emma: 'Polished', bf_isabella: 'Warm storyteller', bf_alice: 'Bright', bf_lily: 'Gentle',
  bm_george: 'Classic narrator', bm_lewis: 'Rich and measured', bm_daniel: 'Neutral', bm_fable: 'Storyteller',
};

const IDS = [
  'af_heart', 'af_bella', 'af_nicole', 'af_sarah', 'af_nova', 'af_sky', 'af_river',
  'am_michael', 'am_adam', 'am_eric', 'am_liam', 'am_onyx', 'am_fenrir', 'am_puck',
  'bf_emma', 'bf_isabella', 'bf_alice', 'bf_lily', 'bm_george', 'bm_lewis', 'bm_daniel', 'bm_fable',
  'ef_dora', 'em_alex', 'ff_siwis', 'hf_alpha', 'hm_omega', 'if_sara', 'im_nicola', 'pf_dora', 'pm_alex',
];

export const VOICES: Voice[] = IDS.map((id) => {
  const raw = id.split('_')[1];
  return {
    id,
    name: raw[0].toUpperCase() + raw.slice(1),
    lang: LANG[id[0]],
    gender: id[1] === 'f' ? 'Female' : 'Male',
    tone: TONES[id] ?? 'Natural',
  };
});

export const LANGUAGES = Array.from(new Set(VOICES.map((v) => v.lang)));

export const voiceById = (id: string | null | undefined) => VOICES.find((v) => v.id === id) ?? VOICES[0];
