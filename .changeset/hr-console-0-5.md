---
"@skillcdn/console-plugin-hr": minor
---

Breaking: built for console 0.5.0 or later; upgrade the console first. A console before 0.5.0 refused every upgrade a plugin's records needed, so that a deployment which installed 0.3 over 0.2 kept its records at data version 2, each kind of leave without its own rule of cancelling. On 0.5.0 the upgrade to data version 3 runs when the deployment starts, and writes on each kind the rule the configuration held. Read each kind's rule on the Setup page afterwards; `console plugins` names a plugin whose records are still behind its code.
