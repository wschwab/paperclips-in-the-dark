# Ada backend agent guide

This guide is part of the Track A implementation. Add a short note here when
a toolchain problem takes more than three iterations or when an AWS idiom is
confirmed against the selected release.

## A0 facts

- The selected toolchain is GNAT FSF 16.1.0, GPRbuild 26.0.1, and Alire 2.1.1.
- server/ uses AWS 21.0.0. core/ uses gnatprove 16.1.0 as a pinned
  development dependency.
- In this managed shell, /run/user/1000 is read-only even though it is the
  normal runtime directory. Alire needs a writable temporary runtime directory,
  so use XDG_RUNTIME_DIR=/tmp alr ... (the checked-in ci.sh does this).
- AWS's retained callback must be a library-level function with the profile
  function (Request : AWS.Status.Data) return AWS.Response.Data; A0 keeps it
  in server/src/pitd_callback.adb rather than nesting it in pitd.adb.
- Alire crate names must be lowercase identifiers without hyphens; the source
  directories remain core/ and server/, while their crate names are
  paperclips_core and paperclips_server.
- Alire's supported non-interactive mode is the global --non-interactive flag.
  Piping a blank line to the confirmation prompt did not apply the dependency
  changes reliably in this shell.
- AWS 25.2.0 defaults to Debug, which enables -gnatwe. GNAT 16.1 then treated
  two harmless upstream unused-use-clause warnings as errors. Its libgpr
  25.0.0 dependency also failed on GNAT 16.1 with time_t and ordered-map
  operator errors. AWS 21.0.0 is the pinned release used here because it is
  cataloged for GNAT 9+ and avoids that incompatible libgpr stack; its callback
  and response APIs are compatible with this bootstrap.

## Ada style crib sheet

- Use Ada 2012/GNAT 2022, four-space indentation, one declaration per line,
  and names in Mixed_Case_With_Underscores.
- Keep use clauses narrow. For overloaded operators on AWS types, add an
  explicit use type clause instead of a broad use clause.
- Put public contracts and type invariants in the .ads file. Keep bodies
  small and name intermediate values rather than relying on long expressions.
- Use Unbounded_String at IO/configuration boundaries; convert to String at an
  AWS or filesystem call.
- The core is SPARK_Mode (On) and IO-free. The AWS server is an explicit
  SPARK_Mode (Off) boundary by design; do not pull filesystem or HTTP code
  into core/.

## SPARK / gnatprove loop

For a changed unit, prove only that unit first:

    cd backend-ada/core
    XDG_RUNTIME_DIR=/tmp alr exec -- gnatprove -u paperclips_core.ads \
      --level=2 --checks-as-errors=on

Then run the project gate:

    XDG_RUNTIME_DIR=/tmp alr exec -- gnatprove -P paperclips_core.gpr \
      --level=2 --checks-as-errors=on

Common counterexample patterns and fixes:

- possibly uninitialized / an assertion with an unconstrained value:
  initialize every local before a branch, and make each branch assign the
  output.
- Array or string slice bounds: prove the length guard immediately before the
  slice, or use a loop over the range and avoid a computed slice.
- Integer overflow in a postcondition: express clamp arithmetic in a wider
  subtype or split the calculation into guarded branches before conversion.
- A proof cannot use an IO/helper package: keep the helper outside the SPARK
  unit and pass a simple value into the proven operation; do not weaken the
  contract to make the proof disappear.
- If a proof result seems stale, remove only the unit's generated proof
  artifacts through the normal gnatprove -u/alr clean workflow and rerun; never
  change the contract to fit stale output.
- gnatprove 16.1.0 spells the requested checks-as-errors switch as
  --checks-as-errors=on; the bare --checks-as-errors form fails because this
  release requires an explicit on/off value.
- Ada operators for non-primitive types such as Ada.Directories.File_Kind are
  not directly visible; add a narrow use type clause before comparing them.
- An unconstrained String initialized to "" is not a safe scratch variable for
  a later filesystem path assignment; convert the Unbounded_String in a nested
  declare block as a length-fixed constant before calling Ada.Directories or
  AWS file helpers.
- `delta` is an Ada reserved word (case-insensitive); use `Amount`, `Change`, or
  another domain name for clamp-operation parameters.
- A record discriminant cannot directly constrain a scalar component subtype
  (`Natural range 0 .. Maximum`). Keep the component `Natural` and state the
  discriminant-dependent bound in a `Dynamic_Predicate`; GNATprove can then use
  the same invariant without the declaration being illegal Ada.
- Runtime-supplied maxima typed as unconstrained `Positive` can still defeat
  AoRTE when two capacities are summed or stash is converted at 2:1. Define a
  shared proof-safe settings `Capacity` subtype and reject absurd values at the
  boundary; this parameterizes game rules without hardcoding any game maximum.
- Once a separate test project is added beside the library project, gnatprove
  can no longer infer the project file. Pass `-P paperclips_core.gpr` on the
  whole-core gate (unit `-u` runs may still infer it only when unambiguous).
- For a tiny ordered spillover ladder, an explicit branch per level proves the
  ordering postcondition more reliably than a successor loop. The loop needed
  awkward invariants about the eventual `out` value; four branches directly
  expose both `Landed >= Requested` and the all-full failure path.

## AWS routing idioms

- Start a server with AWS.Server.Start, a AWS.Server.HTTP object, a port, and a
  library-level callback; keep it alive with AWS.Server.Wait (AWS.Server.Forever).
- Read the route with AWS.Status.URI (Request) and the method with
  AWS.Status.Method (Request). Strip a query string before route matching.
- Return JSON using AWS.Response.Build (AWS.MIME.Application_JSON, Body).
- Return an existing static file using
  AWS.Response.File (AWS.MIME.Content_Type (Filename), Filename).
- Return errors with AWS.Response.Acknowledge and an AWS status code.
- Log exactly once from the callback after constructing the response. Keep the
  line valid JSON and include method, path, and status.
- Reject .. path segments before joining a request path to the static root.
  Only GET/HEAD should reach static serving; reserve /api/* for API routes.

## Alire command cheatsheet

    XDG_RUNTIME_DIR=/tmp alr --non-interactive build
    XDG_RUNTIME_DIR=/tmp alr with gnatprove=16.1.0
    XDG_RUNTIME_DIR=/tmp alr with aws=21.0.0
    XDG_RUNTIME_DIR=/tmp alr exec -- gnatprove --level=2 --checks-as-errors=on
    XDG_RUNTIME_DIR=/tmp alr clean

Pin direct dependencies in alire.toml; keep the generated alire.lock checked
in so transitive AWS/XMLAda/GNATCOLL versions remain reproducible.
