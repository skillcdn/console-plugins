# @skillcdn/console-plugin-messenger

## 0.1.1

### Patch Changes

- [`fe020bd`](https://github.com/skillcdn/console-plugins/commit/fe020bd2eb13de7ef76be554efdeb75765aae1cf) Thanks [@samo-lucid](https://github.com/samo-lucid)! - The names the app shows in Slack, the leave shortcut's among them, are in the language of whoever connects it unless they choose another. 0.1.0 took the first of the console's languages, which is English on every console, so that a Korean workspace got "Request leave" unless 한국어 was chosen on the Connection page. A route reads in the language of whoever adds it unless they choose, and someone the console's pages have not seen yet reads the app's language, as do the problems the hourly job notes. An app made with 0.1.0 keeps its language: choose another on the Connection page and update the app.

- [`d56413d`](https://github.com/skillcdn/console-plugins/commit/d56413d097d4a478297b2882b474601af7956e68) Thanks [@samo-lucid](https://github.com/samo-lucid)! - Reads HR 0.3.0 as it reads 0.2: HR 0.3.0 changed how approved leave is cancelled, each kind by its own rule, kept its events and the option keys of its decisions, and only added to its api, so the leave shortcut and the threads go on with either. The Connection page names the versions read as `>=0.2.0 <0.4.0`.

- [`343c428`](https://github.com/skillcdn/console-plugins/commit/343c428e0b29adeeb3ca44244575e0324c5ac3f5) Thanks [@samo-lucid](https://github.com/samo-lucid)! - The connection page and the manifest say of a secret the console took from Slack's answer that it was received and stored (Korean "받아 저장"), where "sealed" read oddly in Korean; the English says "Received from slack.com", as the console's own settings page does.

## 0.1.0

### Minor Changes

- [`8783476`](https://github.com/skillcdn/console-plugins/commit/87834761131f76f95b641ba7c5f02fa6b5a3541b) Thanks [@samo-lucid](https://github.com/samo-lucid)! - The first version of Messenger, built for console 0.4.6 or later: what the console's plugins have for people, told in Slack, and what people do there brought back. Whoever holds the role `messenger` connects the workspace's Slack from the Connection page, with the app configuration token and its refresh token, which an administrator pastes once: the plugin makes the app, the console seals its secrets, and someone who may install apps installs it from Slack's own page. People are matched to their accounts by email, within the hour and every day. Disconnecting uninstalls the app and deletes it, so that the next connection may be another workspace, as from one kept for trying the plugin to the organization's own. For HR 0.2: a shortcut that opens the leave form in Slack, for the presser's own leave; each request threaded with the person and whoever decides, approved or rejected with a button that answers the console's decision for whoever pressed it, on their plate alone; approved leave told to the channels the Routes page names, in the person's name, and struck through when cancelled. The deployment needs a public https address Slack can reach, and outbound https to slack.com and hooks.slack.com; an administrator turns on `plugins:hr` and grants the messenger HR's role `hr` for the threads.
