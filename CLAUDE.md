Your task is to make a web app for the planning of a Swiss Zivilschutz WK (repeat course). It is similar to a school timetable.Domain description:  
There is a configurable number of _groups_ (usually 3-4). Each group has to visit every “lesson*.A lesson is given by a *teacher* (usually 1, can be N) and is given a *room\*

Technical implementation:

- use [fullcalendar.io](http://fullcalendar.io) and use the “Resource” feature. use the premium version because the app will be open source
- Another AI model gave me the idea to use the _groups_ as the only resource, so we can use the “Vertical Resource View” (with `datesAboveResoures`) and model the other resources manually
- use an easy to use UI framework (like bulma, but search for more fitting ones!) to model the interactions
- the app is meant for desktop computers, there’s no immediate need to fit everything on a phone

The app should:

- have a menu for configurations
  - number of groups
    - total
    - current (the “excess” groups should still keep their data, just be greyed out or something)
    - groups should be given a numbering like G1, G2 etc
    - it can also be that you add the groups, not a number, and then disable them (like you could disable G2 while keeping G1, G3, G4)
  - teachers: name: color
  - room: name, color, exclude from conflict check
  - subjects: name, color
    - defaults
      - teacher (n)
      - room
      - duration (minutes)
  - should maybe be an overlay, maybe as a sidebar
- conflict view: shows all conflicts, and why (maybe a sidebar?)
- main view:
  - have a planning view (sidebar) with the calendar, where the subjects can be pulled from
    - also add a part for “breaks”: lunch break (1h), normal breaks (15 minutes). Model the breaks as a subject maybe?
  - when clicking on an event, the details can be checked in an overlay, or even edited
    - introduce a system where each detail can be edited individually, or reset to the default
  - use 15 minute slots, starting at 07:30 and ending at 19:00. the main part of the day is from 08:00 to 17:00
  - a planned instance of a subject should have its color as the main background color, and maybe an indication of the room and teacher color
  - in case of a “conflict”, make the border color red (or any other type of “conflict” indicator. this conflict indicator should be shown on all instances that are involved in the conflict

Special actions:

- an event can be “split”, that’s needed for example when one session wouldn’t fit before or after a break
- undo

Conflict: a conflict occurs when

- hard conflicts:
  - n instances share the same teachers (teacher A is assigned for instance X and Y), don’t forget that there are N teachers!
- soft conflicts  
   - n instances share the same room, except if excluded  
   - Exclusions might be for a room called “outside”, where it’s not a problem to share the space  
  A conflict should always only be indicated, the change shouldn’t be rejected. If you  


Technical details:

- use TypeScript
- write it in plain JS, not using a framework, unless there is a good reason for it
- use an easy to use but quick build and auto reload system
- use localStorage to store the state, so everything is still there on page reload. At a later stage, I might want to do a full webapp with a backend, but keep it simple for now.
