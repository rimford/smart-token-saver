// The defaults of every setting, as plugin.json declares them (userConfig.*.default). readConfig falls back to the same
// values; a test checks that, and tools/check-defaults.mjs checks this list against plugin.json. Kept as plain JSON
// inside the braces so the script can read it without a TypeScript compiler.
export const CONFIG_DEFAULTS: Readonly<Record<string, string>> = {
  "handoffSkill": "",
  "handoffAfter": "confirm",
  "effortBias": "0",
  "effortFloor": "low",
  "effortCeiling": "high",
  "hide": "reason",
  "modelAuto": "off",
  "helpers": "off",
  "handoffButton": "advised",
  "compactWith": "auto",
  "swampAt": "auto",
  "appearance": "auto",
  "theme": "navy",
  "layout": "default",
  "abControl": "0",
  "compactWindow": "300000",
  "measureLog": "off"
}
