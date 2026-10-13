// AI helpers. They use the free Pollinations.ai service (no API key needed).
// To use another provider, change the two functions at the bottom of this file.

export const IMAGE_STYLES = [
  { id: "none", label: "Auto", suffix: "" },
  { id: "photo", label: "Photo", suffix: ", ultra realistic photograph, natural light, highly detailed" },
  { id: "digital", label: "Digital art", suffix: ", digital art, vibrant colors, highly detailed, trending on artstation" },
  { id: "anime", label: "Anime", suffix: ", anime style illustration, clean lines, soft shading" },
  { id: "3d", label: "3D render", suffix: ", 3d render, soft lighting, octane render, cute stylized" },
  { id: "watercolor", label: "Watercolor", suffix: ", watercolor painting, soft washes, paper texture" },
  { id: "sketch", label: "Pencil sketch", suffix: ", pencil sketch, hand drawn, black and white, cross hatching" },
  { id: "pixel", label: "Pixel art", suffix: ", pixel art, 16-bit, retro game style" },
  { id: "neon", label: "Cyberpunk", suffix: ", cyberpunk, neon lights, futuristic city, dramatic lighting" },
  { id: "flat", label: "Flat / logo", suffix: ", flat vector illustration, minimal, bold shapes, clean background" },
];

export const IMAGE_SIZES = [
  { id: "square", label: "Square", w: 1024, h: 1024 },
  { id: "wide", label: "Wide 16:9", w: 1280, h: 720 },
  { id: "tall", label: "Tall 9:16", w: 720, h: 1280 },
  { id: "cover", label: "Cover banner", w: 1344, h: 448 },
];

export const TEXT_ACTIONS = {
  improve: { label: "Improve writing", prompt: "Improve the clarity and style of the text. Keep the same language and meaning. Return only the improved text." },
  fix: { label: "Fix spelling & grammar", prompt: "Fix spelling and grammar mistakes only. Keep the same language and wording. Return only the corrected text." },
  shorter: { label: "Make shorter", prompt: "Rewrite the text to be shorter and more concise. Keep the same language. Return only the text." },
  longer: { label: "Make longer", prompt: "Expand the text with a little more detail, in the same language and tone. Return only the text." },
  summarize: { label: "Summarize", prompt: "Summarize the text in one or two short sentences, in the same language. Return only the summary." },
  bangla: { label: "Translate to Bangla", prompt: "Translate the text to Bangla (বাংলা). Return only the translation." },
  english: { label: "Translate to English", prompt: "Translate the text to English. Return only the translation." },
};

/* ------------------------------------------------------------ providers */
const IMG_BASE = "https://image.pollinations.ai/prompt/";
const TEXT_URL = "https://text.pollinations.ai/openai";

export async function generateImage({ prompt, styleId, sizeId, seed, model = "flux" }, signal) {
  const style = IMAGE_STYLES.find((s) => s.id === styleId) || IMAGE_STYLES[0];
  const size = IMAGE_SIZES.find((s) => s.id === sizeId) || IMAGE_SIZES[0];
  const full = prompt.trim() + style.suffix;
  const url = `${IMG_BASE}${encodeURIComponent(full)}?width=${size.w}&height=${size.h}&seed=${seed}&model=${model}&nologo=true&enhance=false`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Image service returned ${res.status}`);
  const blob = await res.blob();
  if (!blob.type.startsWith("image/")) throw new Error("The image service did not return an image.");
  return blob;
}

async function chat(system, user, signal) {
  const res = await fetch(TEXT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: "openai",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      private: true,
    }),
  });
  if (!res.ok) throw new Error(`AI service returned ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty answer from the AI service.");
  return text.trim();
}

export function runTextAI(action, text, signal) {
  const a = TEXT_ACTIONS[action];
  return chat(`You are a careful writing assistant inside a note-taking app. ${a.prompt} Do not add quotes, explanations or markdown.`, text, signal);
}

export function enhancePrompt(prompt, signal) {
  return chat(
    "You write prompts for an AI image generator. Rewrite the user's idea as one vivid, detailed English prompt (max 60 words) describing subject, setting, lighting and mood. Return only the prompt.",
    prompt,
    signal
  );
}
