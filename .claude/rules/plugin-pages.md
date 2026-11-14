---
paths:
  - "plugins/*/src/web/**"
---

# Changing how a plugin's page looks

You opened a file of a plugin's pages. The rules for them are in [docs/guide/conventions.md, "Pages"](../../docs/guide/conventions.md#pages), and the parts a page is built from are the console's catalogue, `node_modules/@skillcdn/console/src/styles/README.md`. Read both before you write a class or a line of CSS. This file holds no rule of its own; it is here so that you read those.

What they come to:

- **Find the console's part first.** A look (a colour, a border, a radius, a shadow, a size of type) is a part of the console's: the catalogue lists each with what it is for. Put its `sc-` class on the element.
- **A class of the plugin's only places.** `pl-<key>-...` lays its own element out and says where a part is and how much room it has. It gives nothing a look.
- **The check runs after every file you write here** (`pnpm check:styles`) and says what to do when it refuses. Do that. Never add a class to `src/web/drawn.json` to get a look past it: the list only gets shorter.
- **A part the console lacks is not drawn here.** Say which part came closest and why it does not do, and ask: the part is proposed to the console, as every need of a plugin is.
- **Look at what you changed** on a console of this machine ([docs/guide/local-console.md](../../docs/guide/local-console.md)): the page at a phone's width and on a wide screen, in English and in Korean, a widget in every size it declares, and `/parts` of the console's `pnpm dev` for a part by itself.
