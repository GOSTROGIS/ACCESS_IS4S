# ACCESS application source

This directory contains independent copies of all 21 application source trees.
The application code is present here; these are neither submodules nor catalogue
links. Each `.upstream-source.json` records the upstream commit, original file
hashes and executable modes. Cargo and JavaScript lockfiles retain the actual
supporting dependencies used by the upstream applications.

ACCESS artwork and display labels are applied to these copies. Each
`.fork-brand.json` records its changed files. The FilmCraft source also includes
the tested ACCESS browser encoder and branding patch. Code identifiers, document
formats and command protocols retain their original names for compatibility.
Original notices remain with the source packages.

The folder installation embeds complete browser applications in the ACCESS
skill workspaces. Native applications supply their native-only capabilities.
The integration and its verification scripts live in `../runtime/`; owner
artwork and the repeatable source-branding tool live in `../branding/` and
`../tools/`. Build each copied application using its own workspace and packaging
instructions. Provider credentials and private documents stay outside this tree.

A branded source tree is not proof that a rebuilt runtime works. The current
installed versions and tested cases are recorded separately. All source branding
must be rebuilt and pass the corresponding real editing, save/reopen and export
workflows before it replaces a functioning installed runtime.
