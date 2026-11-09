---
"@skillcdn/console-plugin-messenger": minor
---

Breaking: built for console 0.4.7 or later, which says the workspace's language to a plugin. The app's names in Slack, its shortcut's among them, and a route's channel read the workspace's language where an administrator set one (`console workspace edit --language ko`), unless whoever connects the app or adds the route chooses another; where nobody set one, the language of whoever connects or adds it, as before. Someone the console's pages have not seen yet, with no language of their own, reads their thread and the leave form in the workspace's language, else the app's. The Connection and Routes pages offer the workspace's language first. An app made before keeps its language: choose another on the Connection page and update the app.
