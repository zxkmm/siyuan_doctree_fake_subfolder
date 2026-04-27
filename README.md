# Doctree Fake Subfolder for SiYuan

Make documents in SiYuan's document tree behave like collapsible folders — click to expand/collapse instead of navigating into them.

## What problem does this solve?

By default, SiYuan's document tree requires you to click the tiny arrow icon to expand or collapse a document that has children. If you organize your notes as a deep hierarchy, constantly aiming for that small arrow is frustrating. This plugin lets you click anywhere on the document row to expand/collapse it, just like a file manager.

## How it works

The plugin identifies which documents should be treated as "folders" using three methods (all can be enabled/disabled independently):

### 1. Auto mode *(enabled by default)*
If a document is empty (no content) AND has child documents, it is automatically treated as a folder. Clicking it expands/collapses instead of opening.

### 2. Emoji/icon mode *(enabled by default)*
Documents whose icon matches a configurable emoji list (default: `🗃️,📂,📁`) are treated as folders. Just set a folder-like emoji on documents you want to act as sub-notebooks.

### 3. ID mode *(enabled by default)*
Manually specify document IDs in the settings. Those documents will always be treated as folders.

## Operation modes

Switch between three modes using toolbar buttons (can be hidden in settings):

| Mode | Behavior |
|------|----------|
| **Normal** | Default. Subfolder docs expand/collapse on click. Regular docs open normally. |
| **Capture** | Click any document to toggle it in/out of the ID list — a quick way to build your folder list without opening settings. |
| **Reveal** | Temporarily open subfolder documents to view/edit their content, without removing them from the folder list. |

## Keyboard modifier passthrough

Holding **Shift** or **Ctrl** (or **Cmd** on Mac) while clicking will always pass the click through to SiYuan's default behavior — useful for multi-selection in the document tree. The plugin does not intercept these clicks.

# Credit

## Donator (Leave an issue if you didn't mean to be anonymous)
- Mr / Mrs. anonymous

## Contributors
- [ioxenus](https://github.com/ioxenus)
- [itljsj](https://github.com/tljsj)
- [wilsons](https://ld246.com/member/wilsons) : Wrote SQL and found the getTreeStat API for the auto mode. Thank you!
- [OpaqueGlass](https://github.com/OpaqueGlass) : Although this plugin does not use OpaqueGlass's exact code, I was inspired by their [syplugin-doubleClickFileTree](https://github.com/OpaqueGlass/syplugin-doubleClickFileTree) project. Thank you!

> Disclaimer of Liability
>  * Security & Network Exposure: This plugin is designed strictly for use within a secure, local environment. If you choose to deploy, expose, or run the functionalities of this plugin on a public network or any environment susceptible to external access, you do so entirely at your own risk. You are solely responsible for all consequences, including but not limited to damages from codebase vulnerabilities, supply chain (dependency) exploits, or malicious attacks. The author(s) assumes no liability regardless of whether the plugin is run locally or publicly.
>  * "As-Is" Provision: This plugin is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and noninfringement. In no event shall the authors or copyright holders be liable for any claim, damages, or other liability.
>  * Data Safety & Backups: Note-taking applications contain critical personal data. You are strongly advised to regularly back up your SiYuan Note workspace before installing or updating plugins. The author(s) shall not be held responsible for any data loss, corruption, or unintentional modification caused by the use, misuse, or malfunction of this plugin.
>  * Compatibility & Maintenance: We try our best to be compatible with as many platforms and versions as possible, however future updates to the core SiYuan Note application may cause this plugin to malfunction or break entirely. The author(s) are under no obligation to provide continuous technical support, bug fixes, or compatibility updates.
>
> 免责声明
>  * 安全性与网络暴露风险： 本插件专为在安全的本地环境中运行而设计。如果您选择将本插件的功能部署、暴露于公网或任何其他可能遭受外部网络访问的环境中，您必须完全自行承担由此带来的所有风险。对于因插件本体漏洞、第三方依赖（供应链）漏洞或恶意攻击所造成的任何损失，均由您自行负责。无论本插件在何种环境中运行（包括本地），作者均不承担任何安全相关的法律责任。
>  * "按现状"提供 (As-Is)： 本插件按"现状"提供，不提供任何形式的明示或暗示的保证，包括但不限于对适销性、特定用途适用性和非侵权性的保证。在任何情况下，作者或版权所有者均不对任何索赔、损害或其他责任负责。
>  * 数据安全与备份： 笔记软件包含重要的个人数据。强烈建议您在安装、使用或更新本插件前，定期备份您的思源笔记工作空间。对于因使用、误用或插件自身故障导致的任何数据丢失、损坏或意外修改，作者概不负责。
>  * 兼容性与后续维护： 尽管本插件尽量兼容更多的平台和版本，思源笔记的未来更新可能会导致本插件失效或出现异常。作者没有义务提供持续的技术支持、漏洞修复或兼容性更新。
