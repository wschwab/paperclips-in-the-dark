# CREW-COHORTS-03

Two types per cohort. The SRD lets a gang or expert cohort carry a second type (for example through the Elite or second-type upgrade). A cohort can hold up to two types. The first type stays in the existing single-type field, and the second type is an optional extra.

Authorized by the human. The contract change below was approved in this session.

## Contract change (authorized)

Additive and backward-compatible. Existing single-type records still decode, and clients that send only `gangType` or `expertType` keep working.

Before (at the start of this card):

- `contract/openapi.yaml` `cohort.add` and `cohort.update` request bodies: `gangType: {type: string}`, `expertType: {type: string}`. No second-type field.
- `contract/schemas/crew.json` `cohorts` item: `required` lists `gangType` and `expertType`. `additionalProperties: false`. No second-type field.
- `data/games/crew-settings-schema.json`: no `CohortMaxTypes` key. `data/games/blades-in-the-dark-crews.json`: no `CohortMaxTypes` key.
- Ada `pitd_ops.adb` `cohort.add`/`cohort.update` store only `gangType`/`expertType`. `pitd_normalize.adb` `Allowed_Cohort` lists no second-type field, so it would be dropped on load.

After: see "After" below. The contract adds one optional `extraTypes` array of strings, with `maxItems` one less than the game-settings `CohortMaxTypes` (2 in shipped data, so 1 extra type). The first type stays in `gangType` or `expertType`, so the array name carries no kind. The human's suggested `gangTypes`/`expertTypes` pair was not used, because it would duplicate the existing fields and leave two sources of truth.

## Conformance authorization

`conformance/suites/semantics/cohort-extra-types.test.ts` is new, authorized by this card. No existing conformance test is edited.

## Red

Recorded below as each red test is run.

## After

(filled in at the end of the card)
