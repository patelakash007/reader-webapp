export const VALID_SIZES = new Set(['small', 'medium', 'large', 'xl']);
export const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown']);
export const SUPPORTED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, 'pdf', 'docx']);
export const MAX_FILE_SIZE = 15 * 1024 * 1024;
export const MAX_EXTRACTED_TEXT_CHARS = 1_000_000;
export const MAX_PDF_PAGES = 500;

export const VALID_FONTS = new Set([
  'sans', 'serif', 'minimal', 'bold', 'clean', 'literata', 'merriweather', 'libre', 'atkinson', 'jakarta', 'outfit', 'bebas', 'oswald', 'manrope', 'sora'
]);

export const VALID_THEMES = new Set([
  'claude', 'zen', 'stark', 'paper', 'cream', 'kindle', 'github', 'amber', 'newspaper', 'lavender',
  'dark', 'void', 'carbon', 'midnight', 'obsidian', 'dracula', 'nord', 'catppuccin', 'forest', 'ink'
]);

export const fontMap = {
  serif: { family: 'Georgia, "Times New Roman", serif', weight: 500, url: null },
  sans: { family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', weight: 600, url: null },
  minimal: { family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', weight: 700, url: null },
  bold: { family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', weight: 800, url: null },
  clean: { family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', weight: 700, url: null },
  literata: { family: 'Georgia, "Times New Roman", serif', weight: 700, url: null },
  merriweather: { family: 'Georgia, "Times New Roman", serif', weight: 700, url: null },
  libre: { family: 'Georgia, "Times New Roman", serif', weight: 700, url: null },
  atkinson: { family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', weight: 700, url: null },
  jakarta: { family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', weight: 700, url: null },
  outfit: { family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', weight: 700, url: null },
  bebas: { family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', weight: 700, url: null },
  oswald: { family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', weight: 700, url: null },
  manrope: { family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', weight: 700, url: null },
  sora: { family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', weight: 700, url: null },
  mono: { family: 'ui-monospace, SFMono-Regular, Consolas, monospace', weight: 600, url: null }
};

export const lightPresets = [
  { name: 'Claude', font: 'sans', theme: 'claude', color: 'default', desc: 'Clean warm like Claude.ai' },
  { name: 'Zen', font: 'outfit', theme: 'zen', color: 'default', desc: 'Pure minimal white' },
  { name: 'Stark', font: 'sora', theme: 'stark', color: 'high', desc: 'Bold high contrast' },
  { name: 'Book', font: 'literata', theme: 'paper', color: 'warm', desc: 'Long-form book reading' },
  { name: 'Classic', font: 'merriweather', theme: 'cream', color: 'default', desc: 'Traditional print feel' },
  { name: 'Kindle', font: 'merriweather', theme: 'kindle', color: 'warm', desc: 'E-ink sepia warmth' },
  { name: 'GitHub', font: 'sans', theme: 'github', color: 'default', desc: 'Developer favourite' },
  { name: 'Amber', font: 'atkinson', theme: 'amber', color: 'high', desc: 'High contrast warm' },
  { name: 'Newspaper', font: 'merriweather', theme: 'newspaper', color: 'default', desc: 'Old school print' },
  { name: 'Lavender', font: 'clean', theme: 'lavender', color: 'default', desc: 'Soft purple calm' }
];

export const darkPresets = [
  { name: 'Night', font: 'sans', theme: 'dark', color: 'soft', desc: 'Deep black OLED' },
  { name: 'Void', font: 'sora', theme: 'void', color: 'soft', desc: 'Pure black void' },
  { name: 'Carbon', font: 'minimal', theme: 'carbon', color: 'soft', desc: 'Material dark grey' },
  { name: 'Midnight', font: 'libre', theme: 'midnight', color: 'soft', desc: 'Purple dark elegance' },
  { name: 'Obsidian', font: 'sans', theme: 'obsidian', color: 'soft', desc: 'Note app dark' },
  { name: 'Dracula', font: 'minimal', theme: 'dracula', color: 'soft', desc: 'Famous code dark' },
  { name: 'Nord', font: 'jakarta', theme: 'nord', color: 'soft', desc: 'Arctic blue dark' },
  { name: 'Catppuccin', font: 'clean', theme: 'catppuccin', color: 'soft', desc: 'Pastel dark cozy' },
  { name: 'Forest', font: 'jakarta', theme: 'forest', color: 'soft', desc: 'Green night easy' },
  { name: 'Ink', font: 'literata', theme: 'ink', color: 'soft', desc: 'Navy scholarly' }
];

export const textColorMap = {
  light: { default: null, soft: '#6e6a62', warm: '#78350f', cool: '#1e3a5f', high: '#000000' },
  dark: { default: null, soft: '#b0a898', warm: '#fde68a', cool: '#bfdbfe', high: '#ffffff' }
};

export const STATE_IDLE = 'idle';
export const STATE_PLAYING = 'playing';
export const STATE_PAUSED = 'paused';
export const CHUNK_TARGET = 190;
export const WORDS_PER_MIN = 180;
export const BOUNDARY_FALLBACK_MS = 100;
export const VOICE_POLL_MS = 250;
export const VOICE_POLL_TIMEOUT = 5000;
export const KEEP_ALIVE_MS = 10000;
export const PAGEHIDE_CANCEL_TIMEOUT = 15000;
export const SPEED_STEPS = [0.8, 1.0, 1.2, 1.5, 1.8, 2.0];
