# ADR-0010: A plugin's events and `api` are its contract with other plugins, written in its README, held by a test and versioned with it; a plugin that calls for a person is that person

- Status: Accepted
- Date: 2026-11-08
- Follows [ADR-0008](0008-every-notification-leaves-the-console-through-the-messenger-plugin-which-reads-what-it-tells-as-a-principal.md): the duty it gives a producer, written down. Point 4 depends on the console's side, a plugin as a principal that calls for a person, proposed in the console's repository and adopted here by version; until the console has it, point 4 is a design.

## Context

ADR-0008 made `hr` a producer whose events and `api` another plugin, `messenger`, reads and builds on; `crm` and `finance` will be producers too. The console gives the pieces and no rule for them: an event's payload is the emitter's to define and document; an `api` entry runs with the caller passed through, so that the callee's roles decide again; and every holder of a role of a plugin may read its events. What is missing is what every producer here owes a consumer: what exactly the contract is, where it is written, how it is kept true and how it changes; and how a plugin treats a call from another plugin, with a person behind it or none, once the console passes one (the shape proposed there: the plugin, the roles it was granted and, for a call made for a person, that person, within what both may do).

## Decision

1. **The contract is three things, written in the plugin's README under "The contract":** its events, each kind with the fields of its data and the order they may come in; its `api`, each entry with its input and what it answers; and the option keys of the decisions it raises, so that an answer carried from elsewhere names the option by its key. An event stays thin: ids and a kind, and nothing a holder of a role may not read.
2. **The `api` offers nothing the commands and queries do not.** Each entry runs the function a command or a query runs, under the caller's roles as the plugin reads them everywhere else; a read answers the shape the query answers, with its rules of what each caller sees; there is no path for a plugin that a person could not take. A consumer that needs more asks for a query or a command, which everyone then has.
3. **A test holds the contract to the code,** as the skills are held: the kinds, the fields and the names the section gives exist as it says, and each entry refuses what the command or query refuses. A changed meaning is still read by hand.
4. **A plugin that calls for a person is that person.** The callee takes the person the console names as the one acting, in their language, under the roles the console gives the call, and refuses the call for coming through a plugin only for a security reason its design states and its README records. A plugin that calls for nobody is the roles it holds and no person: what needs a person is refused as it is to a job. Who did what through which plugin is the console's record; where a plugin shows it, it keeps the plugin's key beside the person.
5. **The contract is versioned as the plugin is** ([ADR-0006](0006-a-plugin-has-a-version-of-its-own-and-declares-the-consoles-it-runs-on.md)): a field, an entry or a kind removed or renamed, or a key changed, is a `minor` with `Breaking:` first in its words; an addition is a `patch`. A consumer's module names the range of the producer's versions it was written against, as a manifest names the console's.

## Consequences

- A producer's contract section is written with its first consumer: `hr` documents its leave events and opens `request-view`, `types`, `balance`, `preview`, `request` and `cancel`, with a query for one request beside them.
- A consumer reads one table and the producer's version, never the producer's code or records.
- A call made for a person leaves the trail the person's own would, with the plugin beside them, and is refused where the person would be: the rules of a plugin are written once.
- What a plugin refuses for coming through another is a short list in its design, read by whoever installs both.
- Rejected: a shared package for the shape of what plugins exchange (a package before the second use, around the same table); an `api` of its own for a trusted plugin (the console's roles are the only trust there is); a consumer reading a producer's records (the console forbids it, and records are not a contract); events that carry what a message needs (ADR-0008).
