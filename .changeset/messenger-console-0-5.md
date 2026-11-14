---
"@skillcdn/console-plugin-messenger": minor
---

Breaking: built for console 0.5.0 or later; upgrade the console first. A console before 0.5.0 refused every upgrade a plugin's records needed, so that a connection made by 0.1 stayed without the names and the icon of data version 2. On 0.5.0 the upgrade runs when the deployment starts; `console plugins` names a plugin whose records are still behind its code.
