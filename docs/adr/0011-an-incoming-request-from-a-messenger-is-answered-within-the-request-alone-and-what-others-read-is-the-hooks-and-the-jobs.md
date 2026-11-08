# ADR-0011: An incoming request from a messenger is answered within the request alone, and what others read is the hooks' and the job's

- Status: Accepted
- Date: 2026-11-08
- Amends [ADR-0008](0008-every-notification-leaves-the-console-through-the-messenger-plugin-which-reads-what-it-tells-as-a-principal.md), whose point 4 said `messenger` "writes nothing to a messenger while answering an incoming request". Written when the design was read against the console as shipped (0.4.5 and 0.4.6), which has every part the design depended on.

## Context

ADR-0008 kept a person's click from waiting on a slow messenger: the endpoint answers, and the hooks and the job write. Read to the letter, no form could open. A messenger's shortcut carries a trigger that is good for a few seconds, and the form opens only by a call made within them; a form's submission is checked in the reply to it, which names the fields at fault; a button's press is acknowledged with an empty reply, and the presser alone can be told something more through the address the request carried. Each of these is a write to the messenger, and each is the request's own answer, read by nobody but the person who made it.

The console as shipped bounds what the request may do to the console: a plugin's endpoint takes a webhook as the console itself, verified by the plugin with a secret that verifies and signs nothing, or a person's request held to a role; a plugin acts for a person as the plugin for that person, a member whatever they administer; and it answers a decision for a person only where the decision is on that person's plate.

## Decision

1. **Within the request, `messenger` answers the request and nothing else.** It verifies the signature first. For a shortcut it reads of the producer what the form shows, for the person who pressed, and opens the form. For a submission it checks the form through the producer, for the person, and names the fields at fault in the reply; for a press it acknowledges. A refusal, a presser matched to nobody, a decision not on their plate, a producer's refusal, reaches the presser alone, through the request's own address. The console's part of it is the call for the person and the answer for the person, as ADR-0008 has them, and nothing as the plugin itself.
2. **Nothing anyone else reads is written from the request:** no message posted or edited, no thread begun, no channel told. What the person did goes to the console, and the producer's events bring the hooks what to write, so that an answer from the board and one from the chat leave the same trail, as ADR-0008 point 4 meant.
3. **An adapter keeps the rule for its messenger:** what the request may answer with is what that messenger reads as the request's reply, and the rest waits for the events.

## Consequences

- The seconds a messenger allows hold a signature check, one or two reads of the producer for the person, and one call that opens or checks the form; the spike measures it on a real workspace before the plugin is written.
- A refusal is the one thing a presser is told at once; what they did gets its answer from the hooks, as everyone else does.
- A presser who may answer a decision only as a member of its project, or as an administrator, is refused in the chat and answers on the board, where they see what they answer (the console's ADR-0076); the thread invites those the decision is addressed to.
- Rejected: posting from the request where it would be faster (two paths to the same message, and a message that depends on which path ran); a reply that waits for the hook (past the seconds a messenger allows).
