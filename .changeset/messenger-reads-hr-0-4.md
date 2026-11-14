---
"@skillcdn/console-plugin-messenger": patch
---

Reads HR 0.4 as it reads 0.3. HR 0.4.0 moved to console 0.5 and changed nothing the messenger reads, but the messenger 0.3.0 read HR up to 0.3 alone: with HR 0.4.0 its Connection page said HR was in a version it was not written for, the Slack shortcut lost the leave form, and leave requests were not told in Slack. Install 0.3.1 with HR 0.4.0.
