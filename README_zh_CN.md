# 文档树伪文件夹插件

让思源笔记的文档树像文件管理器一样工作 —— 点击即可展开/折叠，无需直奔小箭头。

## 解决了什么问题？

思源自带的文档树需要点击小小的箭头图标才能展开或折叠有子文档的文档。如果你的笔记层级很深，反复瞄准那个小箭头会非常痛苦。本插件让你点击文档行的任意位置即可展开/折叠，就像操作文件管理器一样自然。

## 工作原理

插件通过三种方式识别哪些文档应该被当作"文件夹"（三种方式可独立开关）：

### 1. 自动模式（默认开启）
如果某个文档内容为空且拥有子文档，则自动将其视为文件夹。点击时展开/折叠，而不是进入文档。

### 2. Emoji 图标模式（默认开启）
文档图标匹配用户配置的 emoji 列表（默认 `🗃️,📂,📁`）时，视为文件夹。只需给想当作子笔记本的文档设置一个文件夹样式的 emoji 即可。

### 3. ID 模式（默认开启）
在设置中手动填入文档 ID，这些文档将始终被视为文件夹。

## 操作模式

通过工具栏按钮在三种模式间切换（可在设置中隐藏按钮）：

| 模式 | 行为 |
|------|------|
| **正常模式** | 默认模式。子文件夹文档点击时展开/折叠，普通文档正常打开。 |
| **捕获模式** | 点击任意文档可将其加入或移出 ID 列表 —— 无需打开设置面板即可快速构建文件夹列表。 |
| **穿透模式** | 临时打开子文件夹文档以查看/编辑内容，不会将其从文件夹列表中移除。 |

## 组合键穿透

按住 **Shift** 或 **Ctrl**（Mac 上为 **Cmd**）点击时，插件不拦截该点击事件，直接交由思源原生逻辑处理 —— 方便在文档树中进行多选操作。

<div align="center">

# <font color="#dd0000">🚨 卑微开发者在线乞讨 🚨</font>

<br>

## <font color="#ff4444">“我已经穷到开始啃键盘上的塑料键帽来欺骗胃部了……”</font>

<br>

**当前的开发者生存状态报告：**
[ ![状态](https://img.shields.io/badge/生存状态-极度饥饿-critical?style=for-the-badge) ](#)
[ ![余额](https://img.shields.io/badge/银行卡余额-￥0.42-red?style=for-the-badge) ](#)
[ ![进度](https://img.shields.io/badge/拼好饭凑单进度-0/9.9-orange?style=for-the-badge) ](#)

<br>

### 😭 **卑微开发者在线乞讨** 😭

现在的我，正蜷缩在没有暖气的地下室角落下，蹭着邻居家微弱的 Wi-Fi 信号，用一台屏幕碎了一半的旧电脑敲着代码。

我已经三天三夜没有见过米饭的样子了。刚才在“拼好饭”看到一个 **9.9元** 的猪脚饭，但我翻遍了所有的口袋，甚至拆开了沙发缝，凑出来的钱连配送费都付不起。

**求求您了，施舍一点吧！您的每一分钱都是我的救命炭水！**

<br>

[ ![救命钱](https://img.shields.io/badge/💰_有经济能力-赏口热饭救命-red?style=for-the-badge&logo=alipay) ](https://zxkmm.com/donate)

[ ![续命星](https://img.shields.io/badge/⭐_囊中羞涩-点个Star续命-blue?style=for-the-badge&logo=github) ](https://github.com/zxkmm/siyuan_doctree_fake_subfolder)

<br>

**“伟大的用户，求您动动金手指，救救这根即将枯萎的赛博独苗吧！”**

---

</div>

# 致谢

## 捐助者（如果您无意匿名，请发 issue 解除匿名）
- 匿名 先生/女士

## 贡献者
- [ioxenus](https://github.com/ioxenus)
- [itljsj](https://github.com/tljsj) ：修复 Docker 兼容问题
- [wilsons](https://ld246.com/member/wilsons) ：在设计全自动模式时帮忙写 SQL 和找到 getTreeStat API。谢谢！
- [OpaqueGlass](https://github.com/OpaqueGlass) ：虽然本插件没有使用 OpaqueGlass 的确切代码，但在写本插件之前我读了他们的 [syplugin-doubleClickFileTree](https://github.com/OpaqueGlass/syplugin-doubleClickFileTree) 项目并从中获得灵感。谢谢！

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
