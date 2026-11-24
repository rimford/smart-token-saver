import type { ThemeName } from './theme'

// The names, versions, links, credit and contact the plugin shows, in one place. A fork changes REPO_URL and GUIDE_URL
// here and the owner in marketplace.json and plugin.json. The atoms' plugin key ('smarttokensaver') is a
// literal type, so a rename spells it out there too.

/** The name every user-facing text says. One constant, so a rename touches one line (plus plugin.json and the docs). */
export const PRODUCT_NAME = 'Smart Token Saver'
/** The plugin's id and its slash command: /smarttokensaver. Settings keys, atoms and the command all use it. */
export const PLUGIN = 'smarttokensaver'
/** The upstream project this plugin is built from. It appears only as credit and where an upstream install is meant. */
export const UPSTREAM_NAME = 'effortless'
/** Where this plugin keeps its own files, under ~/.claude. */
export const DATA_DIR = '.claude/smarttokensaver'
/** This plugin's own version; plugin.json says the same. */
export const OWN_VERSION = '1.0.1'
/** The upstream release this version is based on. UPSTREAM.md keeps the history. */
export const UPSTREAM_BASE = '1.72.0'
/** The guide: what each part does and why. docs/guide/index.html, served by GitHub Pages from the docs folder. */
export const GUIDE_URL = 'https://rimford.github.io/smart-token-saver/guide/'
/** The colour theme a new install starts with: 'navy' (navy & orange). */
export const DEFAULT_THEME: ThemeName = 'navy'
/** This plugin's own repository: the README, updates and bug reports live there. */
export const REPO_URL = 'https://github.com/rimford/smart-token-saver'
/** Where a bug is reported: the repository's issues. */
export const ISSUES_URL = `${REPO_URL}/issues`
/** Where upstream lives; the credit links here. */
export const UPSTREAM_URL = 'https://github.com/HeyCubit/effortless'
/** The credit, word for word the same in the About card, README, UPSTREAM.md, CHANGELOG and the manifests. */
export const CREDIT = `${PRODUCT_NAME} is based on ${UPSTREAM_NAME} by HeyCubit (MIT)`
/** Who to ask, shown in the About card as "Questions: …". Empty: the line is not shown. A fork that wants a contact
 * line sets it here. */
export const SUPPORT_HINT = ''
