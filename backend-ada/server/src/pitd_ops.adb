with Ada.Calendar;
with Ada.Strings.Fixed;
with Ada.Strings.Unbounded;
with Ada.Directories;
with GNATCOLL.JSON;
with Paperclips_Core;
with Paperclips_Core.Bounded_Integers;
with Paperclips_Core.Clocks;
with Paperclips_Core.Experience_Trackers;
with Pitd_Capability;
with Pitd_Normalize;
with Pitd_Common;
with Pitd_Error;

package body Pitd_Ops is
   pragma SPARK_Mode (Off);

   use Ada.Strings.Unbounded;
   use GNATCOLL.JSON;
   use Pitd_Capability;
   use Pitd_Normalize;
   use Pitd_Common;
   use Pitd_Error;
   use type Ada.Calendar.Time;


   --  BUG-008: x-snapshot flags mirror contract/openapi.yaml.  Only ops
   --  declared snapshot-worthy get a history entry; everything else (and any
   --  unknown op) returns False — e.g. stress.clear, armor.set,
   --  harm.healing-clock, clock.progress/reset, gear.lock/unlock/
   --  set-commitment/commit/uncommit, notebook.set, session.set.
   function Snapshots (Op : String) return Boolean is
   begin
      if Op = "stress.add" or else Op = "stress.fix"
        or else Op = "trauma.add" or else Op = "trauma.remove"
        or else Op = "harm.add" or else Op = "harm.remove" or else Op = "harm.heal"
        or else Op = "playbook-xp.add" or else Op = "playbook-xp.clear"
        or else Op = "action.set-rating"
        or else Op = "attribute-xp.add" or else Op = "attribute-xp.clear"
        or else Op = "attribute.levelup"
        or else Op = "ability.take" or else Op = "ability.remove"
        or else Op = "fund.gain" or else Op = "fund.spend" or else Op = "fund.liquidate"
        or else Op = "dossier.update"
        or else Op = "note.add" or else Op = "note.remove"
        or else Op = "heat.add" or else Op = "wanted.add" or else Op = "rep.add"
        or else Op = "coin.add" or else Op = "stash.add" or else Op = "tier.add"
        or else Op = "turf.add" or else Op = "xp.add" or else Op = "xp.clear"
        or else Op = "gear.add" or else Op = "gear.remove"
        or else Op = "gear.clear-commitments"
        or else Op = "hold.set"
        or else Op = "cohort.add" or else Op = "cohort.remove"
        or else Op = "cohort.update"
or else Op = "upgrade.mark" or else Op = "upgrade.unmark"
        or else Op = "fields.update"
        or else Op = "update"
        or else Op = "contact.add" or else Op = "contact.remove"
        or else Op = "contact.closeness"
        or else Op = "faction.set-status" or else Op = "faction.remove"
        or else Op = "end-score" or else Op = "end-downtime"
        or else Op = "retire"
        or else Op = "claim.set" or else Op = "claim.customize"
        or else Op = "claim.reset"
      then
         return True;
      end if;
      return False;
   end Snapshots;

   procedure Core_Clamp_Add
     (Current, Maximum, Amount : Natural; New_Value, Applied : out Natural)
   is
      use Paperclips_Core;
      use Paperclips_Core.Bounded_Integers;
      Item : Bounded_Integer := Create (Capacity (Maximum), Current);
   begin
      Add (Item, Amount, Applied); New_Value := Value (Item);
   end Core_Clamp_Add;

   procedure Core_Clamp_Subtract
     (Current, Maximum, Amount : Natural; New_Value, Applied : out Natural)
   is
      use Paperclips_Core;
      use Paperclips_Core.Bounded_Integers;
      Item : Bounded_Integer := Create (Capacity (Maximum), Current);
   begin
      Subtract (Item, Amount, Applied); New_Value := Value (Item);
   end Core_Clamp_Subtract;

function New_Character (Stem, Playbook : String) return JSON_Value is
      G : constant JSON_Value := Game (Stem);
      S : constant Settings_Ref := (To_Unbounded_String (Stem), G);
      Id : constant String := New_Id;
      T : constant String := Now;
      C : JSON_Value;
      --  The stable DTO skeleton is intentionally explicit: it is the JSON boundary.
      --  SC-A6: every game-domain maximum in the template is read from the
      --  validated game settings (startup-validated; no fallback literal).
      Template : constant String :=
        "{""kind"":""character"",""id"":""" & Id & """,""gameStem"":""" & Stem
        & """,""gameName"":""" & Str_Field (G, "Name") & """,""language"":"""
        & Str_Field (G, "Language", "English") & """,""revision"":1,""formatVersion"":1,""createdAt"":"""
        & T & """,""updatedAt"":""" & T
        & """,""isRetired"":false,""isDeadish"":false,""traumaPending"":false,""isOutOfAction"":false,""stressClearPending"":false,""dossier"":{""name"":"""",""crewId"":"""",""alias"":"""",""look"":"""",""notes"":[],""background"":{""name"":"""",""description"":""""},""heritage"":{""name"":"""",""description"":""""},""vice"":{""name"":"""",""description"":"""",""purveyor"":{""name"":"""",""description"":""""}}},""monitor"":{""stress"":{""current"":0,""max"":"
        & Trim_Image (Settings_Int (S, "StressMax", 0))
        & "},""trauma"":{""traumas"":[],""max"":"
        & Trim_Image (Settings_Int (S, "TraumaMax", 0))
        & "},""harm"":{""lesser"":[],""moderate"":[],""severe"":[],""fatal"":[],""healingClock"":{""segments"":0,""size"":"
        & Trim_Image (Settings_Int (S, "RecoveryClockSize", 0))
        & ",""rollover"":0}},""armor"":{""standardUsed"":false,""heavyUsed"":false,""specialUsed"":false,""hasStandard"":false,""hasHeavy"":false,""hasSpecial"":false}},""talent"":{""attributes"":[]},""playbook"":{""name"":"""
        & Playbook & """,""experience"":{""points"":0,""max"":"
        & Trim_Image (Settings_Int (S, "XpTrackMaxima.Playbook", 0))
        & "},""abilities"":[]},""gear"":{""loadout"":[],""availableGear"":[],""commitment"":""none"",""isCommitmentLocked"":false,""maxBulk"":"
        & Trim_Image (Settings_Int (S, "LoadMaxima.MaxBulk", 0))
        & "},""fund"":{""satchel"":{""coins"":2,""max"":"
        & Trim_Image (Settings_Int (S, "FundMaxima.SatchelMax", 0))
        & "},""stash"":{""coins"":0,""max"":"
        & Trim_Image (Settings_Int (S, "FundMaxima.StashMax", 0))
        & "}},""contacts"":[],""session"":{""playbookExpressions"":0,""characterExpressions"":0,""struggleExpressions"":0,""max"":"
        & Trim_Image (Settings_Int (S, "SessionExpressionMax", 0))
        & "},""notebook"":""""}";
   begin
      C := Read (Template);
      --  Build attributes/actions and playbook defaults from game-settings JSON.
      if G.Kind = JSON_Object_Type and then Has_Field (G, "Attributes") then
         declare Out_A : JSON_Array := Empty_Array; Attrs : constant JSON_Array := Get (G, "Attributes"); begin
            for I in 1 .. Length (Attrs) loop
               declare A0 : constant JSON_Value := Get (Attrs, I); A : JSON_Value := Create_Object;
                  XP : JSON_Value := Create_Object; Acts : JSON_Array := Empty_Array;
               begin
                  Set_Field (A, "name", Str_Field (A0, "Name")); Set_Field (XP, "points", Integer'(0)); Set_Field (XP, "max", Settings_Int (S, "XpTrackMaxima.Attribute", 0)); Set_Field (A, "experience", XP);
                  if Has_Field (A0, "Actions") then
                     declare AA : constant JSON_Array := Get (A0, "Actions"); begin
                        for J in 1 .. Length (AA) loop
                           declare X : JSON_Value := Create_Object; begin
                              Set_Field (X, "name", Str_Field (Get (AA, J), "Name")); Set_Field (X, "rating", Integer'(0));
                              Set_Field (X, "maxRating", Settings_Int (S, "ActionPointMaximum", 0)); Append (Acts, X);
                           end;
                        end loop;
                     end;
                  end if;
                  Set_Field (A, "actions", Acts); Append (Out_A, A);
               end;
            end loop;
            Set_Field (Get (C, "talent"), "attributes", Out_A);
         end;
      end if;
      return C;
   end New_Character;

   function New_Crew (Stem, Crew_Type : String) return JSON_Value is
      G : constant JSON_Value := Game (Stem);
      S : constant Settings_Ref := (To_Unbounded_String (Stem), G);
      Id : constant String := New_Id; T : constant String := Now;
   begin
      return Read ("{""kind"":""crew"",""id"":""" & Id & """,""gameStem"":""" & Stem
        & """,""gameName"":""" & Str_Field (G,"Name") & """,""language"":""" & Str_Field (G,"Language","English")
        & """,""revision"":1,""formatVersion"":1,""createdAt"":""" & T & """,""updatedAt"":""" & T
        & """,""crewTypeName"":""" & Crew_Type & """,""name"":"""",""lair"":"""",""reputation"":"""",""huntingGrounds"":"""",""tier"":0,""hold"":""weak"",""heat"":{""current"":0,""max"":"
        & Trim_Image (Settings_Int (S, "CrewTrackerMaxima.HeatMax", 0))
        & "},""wanted"":{""current"":0,""max"":"
        & Trim_Image (Settings_Int (S, "CrewTrackerMaxima.WantedMax", 0))
        & "},""rep"":{""current"":0,""max"":"
        & Trim_Image (Settings_Int (S, "CrewTrackerMaxima.RepMax", 0))
        & "},""experience"":{""points"":0,""max"":"
        & Trim_Image (Settings_Int (S, "XpTrackMaxima.Crew", 0))
        & "},""specialAbilities"":[],""upgrades"":[],""cohorts"":[],""contacts"":[],""factions"":[],""coin"":0,""stash"":0,""stashCapacity"":"
        --  CONTRACT-04: the derived vault capacity is part of the canonical
        --  create shape (base until Vault boxes are marked).
        & Trim_Image (Settings_Int (S, "CrewStashBaseCapacity", 0))
        & ",""turf"":0,""notes"":[],""claimedClaimIds"":[],""claimOverrides"":[]}");
   end New_Crew;

   --  SC-A1: the frozen clock create writes the Wave-2 canonical shape
   --  (behavior/ownerKind/ownerId/purpose/relatedClockIds).  The legacy
   --  pre-Wave-2 request shape (clockKind) is still accepted and mapped per
   --  legacy rule L5 (clockKind "project" -> behavior "bounded",
   --  "rollover" -> behavior "rollover"); the stored document is always the
   --  canonical shape.
   function New_Clock (B : JSON_Value) return JSON_Value is
      Id : constant String := New_Id; T : constant String := Now;
      Behavior : constant String :=
        (if Has_Field (B, "behavior") then Str_Field (B, "behavior", "bounded")
         elsif Str_Field (B, "clockKind", "project") = "rollover" then "rollover"
         else "bounded");
      C : JSON_Value;
   begin
      C := Read ("{""kind"":""clock"",""id"":""" & Id & """,""revision"":1,""formatVersion"":1,""createdAt"":""" & T & """,""updatedAt"":""" & T
        & """,""name"":""" & Str_Field (B,"name") & """,""ownerKind"":""" & Str_Field (B,"ownerKind","campaign")
        & """,""ownerId"":""" & Str_Field (B,"ownerId") & """,""purpose"":""" & Str_Field (B,"purpose","custom")
        & """,""behavior"":""" & Behavior & """,""segments"":0,""size"":" & Trim_Image (Int_Field (B,"size",4))
        & ",""rollover"":0,""relatedClockIds"":[]}");
      if Has_Field (B, "relatedClockIds") then
         Set_Field (C, "relatedClockIds", Clone (Get (B, "relatedClockIds")));
      end if;
      return C;
   end New_Clock;

   procedure Stamp (E : JSON_Value) is
   begin
      Set_Field (E, "revision", Int_Field (E, "revision") + 1);
      Set_Field (E, "updatedAt", Now);
   end Stamp;

   --  BUG-011 request-schema validation infrastructure.  Spec builds a
   --  field descriptor (name, JSON kind, min length, min int, enum, required)
   --  via a positional constructor so no record aggregates are needed.
   type Spec_Rec is record
      Nm   : Unbounded_String;
      Kd   : JSON_Value_Type;
      MnL  : Natural;
      MnI  : Integer;
      En   : Unbounded_String;
      Rq   : Boolean;
   end record;

   function Spec (Nm : String; Kd : JSON_Value_Type; MnL : Natural := 0;
                  MnI : Integer := Integer'First; En : String := "";
                  Rq : Boolean := True) return Spec_Rec is
   begin
      return (To_Unbounded_String (Nm), Kd, MnL, MnI, To_Unbounded_String (En), Rq);
   end Spec;

   type Spec_List is array (Positive range <>) of Spec_Rec;

   Allowed_Passed : Boolean := True;
   Allowed_Keys : Unbounded_String := Null_Unbounded_String;
   procedure Check_Allowed (Name : UTF8_String; Value : JSON_Value) is
   begin
      if Ada.Strings.Fixed.Index (To_String (Allowed_Keys), "|" & String (Name) & "|") = 0 then
         Allowed_Passed := False;
      end if;
   end Check_Allowed;

   function Has_Any_Field (B : JSON_Value) return Boolean is
      Count : Natural := 0;
      procedure Cnt (Name : UTF8_String; Value : JSON_Value) is begin Count := Count + 1; end Cnt;
   begin
      if B.Kind /= JSON_Object_Type then return False; end if;
      Map_JSON_Object (B, Cnt'Access);
      return Count > 0;
   end Has_Any_Field;

   function Check_Fields (B : JSON_Value; Specs : Spec_List; Bad : out Unbounded_String) return Boolean is
      Allowed : Unbounded_String := To_Unbounded_String ("|");
   begin
      for I in Specs'Range loop
         Allowed := Allowed & To_String (Specs (I).Nm) & "|";
      end loop;
      if B.Kind /= JSON_Object_Type then Bad := To_Unbounded_String("body must be an object"); return False; end if;
      Allowed_Keys := Allowed; Allowed_Passed := True;
      Map_JSON_Object (B, Check_Allowed'Access);
      if not Allowed_Passed then Bad := To_Unbounded_String("unknown field"); Allowed_Passed := True; return False; end if;
      for I in Specs'Range loop
         declare S : Spec_Rec := Specs (I); begin
            if S.Rq and then not Has_Field (B, To_String (S.Nm)) then
               Bad := To_Unbounded_String("missing required field ") & To_String (S.Nm); return False;
            end if;
            if Has_Field (B, To_String (S.Nm)) then
               declare V : constant JSON_Value := Get (B, To_String (S.Nm)); begin
                  if V.Kind /= S.Kd then
                     Bad := To_Unbounded_String("field ") & To_String (S.Nm) & " has wrong type"; return False;
                  end if;
                  if S.Kd = JSON_String_Type and then Str_Field (B, To_String (S.Nm))'Length < S.MnL then
                     Bad := To_Unbounded_String("field ") & To_String (S.Nm) & " too short"; return False;
                  end if;
                  if S.Kd = JSON_Int_Type and then Int_Field (B, To_String (S.Nm)) < S.MnI then
                     Bad := To_Unbounded_String("field ") & To_String (S.Nm) & " below minimum"; return False;
                  end if;
                  if S.Kd = JSON_String_Type and then Length (S.En) > 0 then
                     declare
                        Val : constant String := Str_Field (B, To_String (S.Nm));
                        EStr : constant String := To_String (S.En);
                        P : Natural := 1; E : Natural := 1; Ok : Boolean := False;
                     begin
                        while E <= EStr'Length + 1 loop
                           if E > EStr'Length or else EStr (E) = '|' then
                              if EStr (P .. E - 1) = Val then Ok := True; exit; end if;
                              P := E + 1;
                           end if;
                           E := E + 1;
                        end loop;
                        if not Ok then Bad := To_Unbounded_String("field ") & To_String (S.Nm) & " out of enum"; return False; end if;
                     end;
                  end if;
               end;
            end if;
         end;
      end loop;
      return True;
   end Check_Fields;


   --  BUG-011: per-operation request-schema validation, mirroring the frozen
   --  OpenAPI request bodies.  Returns True when valid; Bad carries the
   --  reason.  Called BEFORE any mutation so invalid requests mutate nothing.
   function Validate_Request (Kind, Op : String; B : JSON_Value; Bad : out Unbounded_String) return Boolean is
      T : String := "";
   begin
      if Op = "character.create" then
         return Check_Fields (B, (Spec ("gameStem", JSON_String_Type),
                                  Spec ("playbook", JSON_String_Type)), Bad);
      elsif Op = "character.createPc" then
         --  CONTRACT-01: frozen request shape (contract/openapi.yaml
         --  /characters/pc POST): additionalProperties false; playbook has
         --  minLength 1; actionRatings is an object of integer ratings >= 0
         --  keyed by every action name the game publishes.  The
         --  settings-derived bounds (budget, cap, name set, playbook
         --  existence) are enforced by Handle_Pc_Create once the stem
         --  resolves to loaded game settings.
         return Check_Fields (B, (Spec ("gameStem", JSON_String_Type),
                                  Spec ("playbook", JSON_String_Type, MnL => 1),
                                  Spec ("actionRatings", JSON_Object_Type)), Bad);
      elsif Op = "crew.create" then
         return Check_Fields (B, (Spec ("gameStem", JSON_String_Type),
                                  Spec ("crewType", JSON_String_Type)), Bad);
elsif Op = "clock.create" then
         --  SC-A7: the frozen create request is exactly
         --  {name, ownerKind, ownerId, purpose, behavior, size} with
         --  optional relatedClockIds (contract/openapi.yaml /clocks POST;
         --  CLOCK-CREATE-015).  The legacy pre-Wave-2 shape (clockKind) is
         --  rejected on the create surface; stored legacy documents migrate
         --  via the SC-A1 canonicalizer (L5), never here.
         return Check_Fields (B, (Spec ("name", JSON_String_Type, MnL => 1),
                                  Spec ("ownerKind", JSON_String_Type,
                                        En => "campaign|character|crew"),
                                  Spec ("ownerId", JSON_String_Type),
                                  Spec ("purpose", JSON_String_Type,
                                        En => "progress|danger|racing|linked|mission|tug-of-war|long-term-project|faction|score|custom"),
                                  Spec ("behavior", JSON_String_Type,
                                        En => "bounded|rollover"),
                                  Spec ("size", JSON_Int_Type, MnI => 1),
                                  Spec ("relatedClockIds", JSON_Array_Type, Rq => False)), Bad);
      elsif Op = "harm.add" or else Op = "harm.remove" then
         return Check_Fields (B, (Spec ("description", JSON_String_Type, MnL => 1),
                                  Spec ("intensity", JSON_String_Type, En => "lesser|moderate|severe|fatal")), Bad);
      elsif Op = "stress.add" then
         return Check_Fields (B, Spec_List'(1 => Spec ("delta", JSON_Int_Type)), Bad);
      elsif Op = "stress.clear" then
         --  CONTRACT-02 (DEC-02 ruling 2026-08-24): amount-based vice
         --  indulgence — the formerly bodyless op now requires `amount`
         --  (integer >= 0).  Missing/invalid amount -> VALIDATION before any
         --  lifecycle gate runs (BUG-011 ordering).
         return Check_Fields (B, Spec_List'(1 => Spec ("amount", JSON_Int_Type, MnI => 0)), Bad);
      elsif Op = "stress.fix" then
         --  CONTRACT-03 (DEC-03 ruling 2026-08-24): gated clerical-error
         --  correction — {value} sets monitor.stress.current directly.
         --  Missing/invalid value -> VALIDATION before any lifecycle gate
         --  runs (BUG-011 ordering).
         return Check_Fields (B, Spec_List'(1 => Spec ("value", JSON_Int_Type, MnI => 0)), Bad);
      elsif Op = "trauma.add" or else Op = "trauma.remove" then
         return Check_Fields (B, Spec_List'(1 => Spec ("trauma", JSON_String_Type, MnL => 1)), Bad);
      elsif Op = "armor.set" then
         return Check_Fields (B, (Spec ("armor", JSON_String_Type, En => "standard|heavy|special"),
                                  Spec ("used", JSON_Boolean_Type)), Bad);
      elsif Op = "gear.add" or else Op = "gear.remove" then
         return Check_Fields (B, (Spec ("name", JSON_String_Type, MnL => 1),
                                  Spec ("bulk", JSON_Int_Type, MnI => 0, Rq => False)), Bad);
      elsif Op = "gear.commit" or else Op = "gear.uncommit" then
         return Check_Fields (B, Spec_List'(1 => Spec ("name", JSON_String_Type, MnL => 1)), Bad);
      elsif Op = "gear.set-commitment" then
         return Check_Fields (B, Spec_List'(1 => Spec ("commitment", JSON_String_Type, En => "none|light|normal|heavy|encumbered")), Bad);
      elsif Op = "fund.gain" or else Op = "fund.spend" or else Op = "fund.liquidate" then
         return Check_Fields (B, Spec_List'(1 => Spec ("coins", JSON_Int_Type, MnI => 1)), Bad);
      elsif Op = "note.add" then
         return Check_Fields (B, Spec_List'(1 => Spec ("text", JSON_String_Type, MnL => 1)), Bad);
      elsif Op = "note.remove" then
         return Check_Fields (B, Spec_List'(1 => Spec ("index", JSON_Int_Type, MnI => 0)), Bad);
      elsif Op = "session.set" then
         if not Has_Any_Field (B) then Bad := To_Unbounded_String("session.set requires at least one expression field"); return False; end if;
         return Check_Fields (B, (Spec ("playbookExpressions", JSON_Int_Type, MnI => 0, Rq => False),
                                  Spec ("characterExpressions", JSON_Int_Type, MnI => 0, Rq => False),
                                  Spec ("struggleExpressions", JSON_Int_Type, MnI => 0, Rq => False)), Bad);
      elsif Op = "dossier.update" then
         if not Has_Any_Field (B) then Bad := To_Unbounded_String("dossier.update requires at least one field"); return False; end if;
         return Check_Fields (B, (Spec ("name", JSON_String_Type, Rq => False),
                                  Spec ("crewId", JSON_String_Type, Rq => False),
                                  Spec ("alias", JSON_String_Type, Rq => False),
                                  Spec ("look", JSON_String_Type, Rq => False),
                                  Spec ("notes", JSON_Array_Type, Rq => False),
                                  Spec ("background", JSON_Object_Type, Rq => False),
                                  Spec ("heritage", JSON_Object_Type, Rq => False),
                                  Spec ("vice", JSON_Object_Type, Rq => False)), Bad);
      elsif Op = "heat.add" or else Op = "wanted.add" or else Op = "rep.add"
        or else Op = "xp.add" or else Op = "turf.add" or else Op = "coin.add"
        or else Op = "stash.add" or else Op = "tier.add"
      then
         return Check_Fields (B, Spec_List'(1 => Spec ("delta", JSON_Int_Type)), Bad);
      elsif Op = "hold.set" then
         return Check_Fields (B, Spec_List'(1 => Spec ("hold", JSON_String_Type, En => "strong|weak")), Bad);
      elsif Op = "cohort.add" then
         return Check_Fields (B, (Spec ("cohortKind", JSON_String_Type, En => "gang|expert"),
                                  Spec ("gangType", JSON_String_Type, Rq => False),
                                  Spec ("expertType", JSON_String_Type, Rq => False),
                                  Spec ("quality", JSON_Int_Type, MnI => 0, Rq => False),
                                  Spec ("scale", JSON_Int_Type, MnI => 0, Rq => False),
                                  Spec ("hasArmor", JSON_Boolean_Type, Rq => False),
                                  Spec ("edges", JSON_Array_Type, Rq => False),
                                  Spec ("flaws", JSON_Array_Type, Rq => False),
                                  Spec ("description", JSON_String_Type, Rq => False)), Bad);
      elsif Op = "cohort.remove" then
         return Check_Fields (B, Spec_List'(1 => Spec ("cohortId", JSON_String_Type, MnL => 1)), Bad);
      elsif Op = "cohort.update" then
         if not Check_Fields (B, (Spec ("cohortId", JSON_String_Type, MnL => 1),
                                  Spec ("gangType", JSON_String_Type, Rq => False),
                                  Spec ("expertType", JSON_String_Type, Rq => False),
                                  Spec ("quality", JSON_Int_Type, MnI => 0, Rq => False),
                                  Spec ("scale", JSON_Int_Type, MnI => 0, Rq => False),
                                  Spec ("hasArmor", JSON_Boolean_Type, Rq => False),
                                  Spec ("edges", JSON_Array_Type, Rq => False),
                                  Spec ("flaws", JSON_Array_Type, Rq => False),
                                  Spec ("harm", JSON_String_Type, En => "healthy|weakened|impaired|broken|dead", Rq => False),
                                  Spec ("description", JSON_String_Type, Rq => False)), Bad)
         then
            return False;
         end if;
         --  frozen contract: minProperties 2 (cohortId plus at least one
         --  update field)
         declare
            Count : Natural := 0;
            procedure Cnt (Name : UTF8_String; Value : JSON_Value) is
            begin
               Count := Count + 1;
            end Cnt;
         begin
            Map_JSON_Object (B, Cnt'Access);
            if Count < 2 then
               Bad := To_Unbounded_String ("cohort.update requires cohortId plus at least one field");
               return False;
            end if;
         end;
         return True;
      elsif Op = "contact.add" then
         --  CONTRACT-05: on characters the body is {name} only (per-scoundrel
         --  contacts); crews keep the C3 {name, profession} shape.
         if Kind = "character" then
            return Check_Fields (B, Spec_List'(1 => Spec ("name", JSON_String_Type, MnL => 1)), Bad);
         end if;
         return Check_Fields (B, (Spec ("name", JSON_String_Type, MnL => 1),
                                  Spec ("profession", JSON_String_Type)), Bad);
      elsif Op = "contact.closeness" and then Kind = "character" then
         --  CONTRACT-05: set closeness friend|contact|rival on the named contact.
         return Check_Fields (B, (Spec ("name", JSON_String_Type, MnL => 1),
                                  Spec ("closeness", JSON_String_Type, En => "friend|contact|rival")), Bad);
      elsif Op = "contact.remove" then
         return Check_Fields (B, Spec_List'(1 => Spec ("name", JSON_String_Type, MnL => 1)), Bad);
      elsif Op = "faction.set-status" then
         return Check_Fields (B, (Spec ("name", JSON_String_Type, MnL => 1),
                                  Spec ("status", JSON_Int_Type)), Bad);
      elsif Op = "faction.remove" then
         return Check_Fields (B, Spec_List'(1 => Spec ("name", JSON_String_Type, MnL => 1)), Bad);
      elsif Op = "upgrade.mark" or else Op = "upgrade.unmark" then
         return Check_Fields (B, Spec_List'(1 => Spec ("name", JSON_String_Type, MnL => 1)), Bad);
      elsif Op = "end-score" then
         --  W15: the body is optional — a missing or empty body is valid;
         --  only present fields are constrained.
         return Check_Fields (B, (Spec ("clearArmorUsed", JSON_Boolean_Type, Rq => False),
                                  Spec ("resetLoadoutCommitment", JSON_Boolean_Type, Rq => False)), Bad);
      elsif Op = "retire" then
         return Check_Fields (B, Spec_List'(1 => Spec ("confirm", JSON_Boolean_Type)), Bad);
      elsif Op = "end-downtime" then
         return Check_Fields (B, (Spec ("clearSessionExpressions", JSON_Boolean_Type, Rq => False),
                                  Spec ("viceReliefStress", JSON_Int_Type, MnI => 0, Rq => False)), Bad);
      elsif Op = "claim.set" then
         return Check_Fields (B, (Spec ("claimId", JSON_String_Type, MnL => 1),
                                  Spec ("claimed", JSON_Boolean_Type)), Bad);
      elsif Op = "claim.customize" then
         if not Has_Any_Field (B) then
            Bad := To_Unbounded_String ("claim.customize requires claimId"); return False;
         end if;
         return Check_Fields (B, (Spec ("claimId", JSON_String_Type, MnL => 1),
                                  Spec ("name", JSON_String_Type, Rq => False),
                                  Spec ("description", JSON_String_Type, Rq => False),
                                  Spec ("effects", JSON_Array_Type, Rq => False)), Bad);
      elsif Op = "claim.reset" then
         return Check_Fields (B, Spec_List'(1 => Spec ("claimId", JSON_String_Type, MnL => 1)), Bad);
elsif Op = "clock.progress" then
         --  SC-A7: signed delta (W6 tug-of-war); negative empties the clock.
         return Check_Fields (B, Spec_List'(1 => Spec ("segments", JSON_Int_Type)), Bad);
      elsif Op = "clock.reset" then
         return True;
      elsif Op = "update" then
         --  SC-A7: clock update (contract/openapi.yaml /clocks/{id}/update):
         --  partial owner/purpose/relationship update.  ownerKind and
         --  ownerId are updated together — provide both or neither
         --  (CLOCK-OWNER-003).  Mechanical fields are not editable here.
         if not Check_Fields (B, (Spec ("ownerKind", JSON_String_Type,
                                        En => "campaign|character|crew", Rq => False),
                                  Spec ("ownerId", JSON_String_Type, Rq => False),
                                  Spec ("purpose", JSON_String_Type,
                                        En => "progress|danger|racing|linked|mission|tug-of-war|long-term-project|faction|score|custom",
                                        Rq => False),
                                  Spec ("relatedClockIds", JSON_Array_Type, Rq => False)), Bad)
         then
            return False;
         end if;
         if not Has_Any_Field (B) then
            Bad := To_Unbounded_String ("update requires at least one field");
            return False;
         end if;
         if Has_Field (B, "ownerKind") /= Has_Field (B, "ownerId") then
            Bad := To_Unbounded_String ("ownerKind and ownerId must be provided together");
            return False;
         end if;
         return True;
      elsif Op = "fields.update" then
         if not Has_Any_Field (B) then Bad := To_Unbounded_String ("fields.update requires at least one field"); return False; end if;
         return True;
      end if;
      return True;
   end Validate_Request;

   function Mutate (Kind, Op : String; E, B : JSON_Value) return JSON_Value is
      Requested : Integer := Integer'First; Effective : Integer := Integer'First;
      New_Value, Applied : Natural := 0;
      Target : JSON_Value;

      --  SC-A3: shared retirement cleanup (Q33 / LIFECYCLE-RETIRE-004),
      --  used by the explicit retire op and by resolving the max-th trauma:
      --  isRetired true; stress 0; pending/out-of-action flags false; all
      --  harm cleared; healing clock reset; armor usage false; isDeadish
      --  recomputed false.  Dossier, playbook, trauma history, notes, gear,
      --  and fund are preserved verbatim.
      procedure Retire_Character is
      begin
         Set_Field (E, "isRetired", True);
         Set_Field (Get (Get (E, "monitor"), "stress"), "current", Integer'(0));
         Set_Field (E, "traumaPending", False);
         Set_Field (E, "isOutOfAction", False);
         Set_Field (E, "stressClearPending", False);
         declare
            H : constant JSON_Value := Get (Get (E, "monitor"), "harm");
         begin
            Set_Field (H, "lesser", Empty_Array);
            Set_Field (H, "moderate", Empty_Array);
            Set_Field (H, "severe", Empty_Array);
            Set_Field (H, "fatal", Empty_Array);
            Set_Field (Get (H, "healingClock"), "segments", Integer'(0));
            Set_Field (Get (H, "healingClock"), "rollover", Integer'(0));
         end;
         declare
            A : constant JSON_Value := Get (Get (E, "monitor"), "armor");
         begin
            Set_Field (A, "standardUsed", False);
            Set_Field (A, "heavyUsed", False);
            Set_Field (A, "specialUsed", False);
         end;
         Set_Field (E, "isDeadish", False);
      end Retire_Character;
begin
      --  SC-A8: the RETIRED gate is the frozen allow/deny lists
      --  (lifecycle-matrix § 6).  On a retired character only the
      --  allow-list proceeds: dossier.update, note.add/remove, notebook.set,
      --  trauma.remove (the trauma-history correction path — never
      --  recomputes isRetired), plus the direct entity ops handled before
      --  Mutate (undo/delete/import) and all reads.  Every gameplay
      --  mutation — including trauma.add and end-score — returns RETIRED.
      if Kind = "character" and then Bool_Field (E, "isRetired")
        and then Op /= "dossier.update" and then Op /= "note.add"
        and then Op /= "note.remove" and then Op /= "notebook.set"
        and then Op /= "trauma.remove"
      then return Retired_Error (Op, "character is retired", E); end if;

      if Op = "stress.add" then
         Target := Get (Get (E,"monitor"),"stress"); Requested := Int_Field (B,"delta");
         --  LIFECYCLE gates: a pending trauma blocks until resolved;
         --  an out-of-action character is blocked until end-score releases.
         if Bool_Field (E, "traumaPending") then
            return Trauma_Required_Error
              (Op, "pending trauma must be resolved before adding stress", E);
         end if;
         if Bool_Field (E, "isOutOfAction") then
            return Out_Of_Action_Error
              (Op, "character is out of action until end-score", E);
         end if;
         declare
            Old : constant Integer := Int_Field (Target, "current");
         begin
            if Requested >= 0 then Core_Clamp_Add (Natural (Old), Natural (Int_Field (Target,"max")), Natural (Requested), New_Value, Applied);
            else Core_Clamp_Subtract (Natural (Old), Natural (Int_Field (Target,"max")), Natural (-Requested), New_Value, Applied); end if;
            Set_Field (Target,"current",Integer (New_Value));
            Effective := (if Requested >= 0 then Integer (Applied) else -Integer (Applied));
            --  LIFECYCLE-STRESS-001: landing at max from below raises the
            --  pending-trauma flag (NEVER auto-trauma, LIFECYCLE-STRESS-002).
            if Requested > 0 and then Old < Int_Field (Target, "max")
              and then New_Value = Natural (Int_Field (Target, "max"))
            then
               Set_Field (E, "traumaPending", True);
               return Success_Result (Op,E,Requested,Effective,
                                      Side => "stress full — trauma pending");
            end if;
            return Success_Result (Op,E,Requested,Effective,
              Side => (if Requested >= 0
                         and then New_Value = Natural (Int_Field (Target, "max"))
                       then "stress full — consider trauma" else ""));
         end;
      elsif Op = "stress.clear" then
         if Bool_Field (E, "traumaPending") then
            return Trauma_Required_Error
              (Op, "pending trauma must be resolved before clearing stress", E);
         end if;
         if Bool_Field (E, "isOutOfAction") then
            return Out_Of_Action_Error
              (Op, "character is out of action until end-score", E);
         end if;
         --  CONTRACT-02 (DEC-02 ruling, 2026-08-24): amount-based vice
         --  indulgence.  Quantity result family: applied.requested is the
         --  requested amount, applied.effective the amount actually cleared
         --  after clamping to the currently marked stress.  A request larger
         --  than the marked stress lands Stress at 0 and returns the typed
         --  OVERINDULGED_SIDEEFFECT so clients can render the SRD
         --  Overindulgence notice; an exact-amount clear does not signal it.
         declare
            M   : constant JSON_Value := Get (Get (E, "monitor"), "stress");
            Req : constant Integer := Int_Field (B, "amount");
            Old : constant Natural := Natural (Int_Field (M, "current"));
         begin
            Requested := Req;
            Core_Clamp_Subtract
              (Old, Natural (Int_Field (M, "max")), Natural (Req),
               New_Value, Applied);
            Set_Field (M, "current", Integer (New_Value));
            Effective := Integer (Applied);
            if Applied < Natural (Req) then
               return Success_Result
                 (Op, E, Requested, Effective,
                  Side => OVERINDULGED_SIDEEFFECT);
            end if;
         end;
      elsif Op = "stress.fix" then
         --  CONTRACT-03 (DEC-03 ruling, 2026-08-24): gated clerical-error
         --  correction.  Absolute-setter family: applied.requested is the
         --  requested target, applied.effective the stored target after
         --  clamping into [0, StressMax] (game settings).  A correction
         --  records state and never plays: no traumaPending raise and no
         --  sideEffects (LIFECYCLE-STRESS-001 does not fire).  Gates are the
         --  sibling stress ops'; retired is handled by the shared deny-list
         --  above.
         if Bool_Field (E, "traumaPending") then
            return Trauma_Required_Error
              (Op, "pending trauma must be resolved before correcting stress", E);
         end if;
         if Bool_Field (E, "isOutOfAction") then
            return Out_Of_Action_Error
              (Op, "character is out of action until end-score", E);
         end if;
         declare
            M   : constant JSON_Value := Get (Get (E, "monitor"), "stress");
            Req : constant Integer := Int_Field (B, "value");
         begin
            Requested := Req;
            Core_Clamp_Add
              (0, Natural (Int_Field (M, "max")), Natural (Req),
               New_Value, Applied);
            Set_Field (M, "current", Integer (New_Value));
            Effective := Integer (Applied);
         end;
      elsif Op = "trauma.add" or else Op = "trauma.remove" then
         declare
            T     : constant JSON_Value := Get(Get(E,"monitor"),"trauma");
            A     : constant JSON_Array := Get(T,"traumas");
            O     : JSON_Array := Empty_Array;
            Name  : constant String := Str_Field(B,"trauma");
            Found : Boolean := False;
         begin
            for I in 1..Length(A) loop
               if String'(Get(Get(A,I)))=Name then Found:=True;end if;
            end loop;
            if Op = "trauma.add" then
               --  W14: resolution-only — never auto-adds trauma; requires
               --  the pending flag raised by landing at max stress.
               if not Bool_Field (E, "traumaPending") then
                  return Validation_Error
                    (Op, "trauma.add requires a pending trauma (stress at maximum)",
                     Root_Issues ("trauma.add requires a pending trauma (stress at maximum)"), E);
               end if;
               if Found then
                  return Duplicate_Error (Op, "trauma already in history", E);
               end if;
               O := A; Append (O, Create (Name));
               Set_Field (T,"traumas",O);
               --  LIFECYCLE-TRAUMA-001: resolution clears the pending flag
               --  and puts the character out of action; CONTRACT-02
               --  (DEC-02 ruling, 2026-08-24): it ALSO clears Stress to 0
               --  in this same atomic apply.
               Set_Field (E, "traumaPending", False);
               Set_Field (E, "isOutOfAction", True);
               Set_Field (E, "stressClearPending", True);
               Set_Field (Get (Get (E, "monitor"), "stress"),
                          "current", Integer'(0));
               --  resolving the max-th trauma runs the shared retirement
               --  cleanup in the SAME transition (LIFECYCLE-TRAUMA-001/002)
               if Length (O) >= Natural (Int_Field (T, "max")) then
                  Retire_Character;
               end if;
            else
               --  trauma.remove: the trauma-history correction path, allowed
               --  on retired characters; never recomputes isRetired.
               for I in 1..Length(A) loop
                  if String'(Get(Get(A,I)))=Name then Found:=True;
                  else Append(O,Get(A,I));end if;
               end loop;
               if not Found then
                  return Not_Found_Error (Op, "trauma not found", E);
               end if;
               Set_Field(T,"traumas",O);
            end if;
         end;
elsif Op = "harm.add" then
         declare
            H : constant JSON_Value := Get (Get (E, "monitor"), "harm");
            Start : constant String := Str_Field (B, "intensity", "lesser");
            Desc : constant String := Str_Field (B, "description");
            Land : Unbounded_String;
            Old_Fatal : constant Natural := Array_Length (H, "fatal");
            --  SC-A6: per-level slot capacities come from the validated
            --  game settings (HarmCapacities), never a literal.
            HC : constant JSON_Value :=
              (if Game (Str_Field (E, "gameStem")).Kind = JSON_Object_Type
               then Get (Game (Str_Field (E, "gameStem")), "HarmCapacities")
               else Create_Object);
            function Cap_For (Level : String) return Natural is
            begin
               if Level = "lesser" then return Natural (Int_Field (HC, "Lesser", 0));
               elsif Level = "moderate" then return Natural (Int_Field (HC, "Moderate", 0));
               elsif Level = "severe" then return Natural (Int_Field (HC, "Severe", 0));
               else return Natural (Int_Field (HC, "Fatal", 0));
               end if;
            end Cap_For;
         begin
            for Level of Level_Array'(To_Unbounded_String("lesser"),To_Unbounded_String("moderate"),To_Unbounded_String("severe"),To_Unbounded_String("fatal")) loop
               if (Start="lesser" or else To_String(Level)/="lesser") and then (Start/="severe" or else (To_String(Level)="severe" or else To_String(Level)="fatal")) and then (Start/="moderate" or else To_String(Level)/="lesser") and then (Start/="fatal" or else To_String(Level)="fatal") then
                  declare A:constant JSON_Array:=Get(H,To_String(Level));Cap:constant Natural:=Cap_For(To_String(Level));begin if Length(A)<Cap and then Length(Land)=0 then declare O:JSON_Array:=A;begin Append(O,Create(Desc));Set_Field(H,To_String(Level),O);Land:=Level;end;end if;end;
               end if;
            end loop;
            if Length(Land)=0 then return Slot_Full_Fatal_Error(Op,"all harm slots are full",E);end if;
                        --  LIFECYCLE-DEADISH-001: becoming deadish (fatal 0 -> 1) runs
                        --  the deadish cleanup in the same transition — stress and all
                        --  pending/out-of-action state cleared; ALL harm preserved
                        --  (lifecycle-matrix § 7.2).
                        if To_String (Land) = "fatal" and then Old_Fatal = 0 then
                           Set_Field (Get (Get (E, "monitor"), "stress"), "current", Integer'(0));
                           Set_Field (E, "traumaPending", False);
                           Set_Field (E, "isOutOfAction", False);
                           Set_Field (E, "stressClearPending", False);
                        end if;
                        Set_Field(E,"isDeadish",Array_Length(H,"fatal")>0);return Success_Result(Op,E,Landed=>To_String(Land),Side=>(if To_String(Land)/=Start then "harm spilled to "&To_String(Land) else ""));
         end;
      elsif Op = "harm.remove" then
         declare H:constant JSON_Value:=Get(Get(E,"monitor"),"harm");Level:constant String:=Str_Field(B,"intensity");Desc:constant String:=Str_Field(B,"description");A:constant JSON_Array:=Get(H,Level);O:JSON_Array:=Empty_Array;Skipped:Boolean:=False;begin for I in 1..Length(A) loop if not Skipped and then String'(Get(Get(A,I)))=Desc then Skipped:=True;else Append(O,Get(A,I));end if;end loop;Set_Field(H,Level,O);Set_Field(E,"isDeadish",Array_Length(H,"fatal")>0);end;
      elsif Op = "armor.set" then
         declare A:constant JSON_Value:=Get(Get(E,"monitor"),"armor");Name:constant String:=Str_Field(B,"armor");Used:constant Boolean:=Bool_Field(B,"used");Key:constant String:=(if Name="standard" then "standardUsed" elsif Name="heavy" then "heavyUsed" else "specialUsed");Has:constant String:=(if Name="standard" then "hasStandard" elsif Name="heavy" then "hasHeavy" else "hasSpecial");begin
            --  BUG-006: availability is derived from loadout/abilities.
            Set_Field (A, Has, Armor_Available (E, Name));
            if Used and then not Armor_Available (E, Name) then
               return Armor_Not_Available_Error(Op,"armor is not available",E);
            end if;
            Set_Field(A,Key,Used);
         end;
      elsif Op = "playbook-xp.add" then
         Target := Get (Get (E,"playbook"),"experience"); Requested := Int_Field (B,"delta");
         --  SC-A6: signed-delta family — negative deltas reduce the track
         --  and clamp at zero (effective is the signed actual change).
         if Requested >= 0 then
            Core_Clamp_Add (Natural (Int_Field(Target,"points")),Natural(Int_Field(Target,"max")),Natural (Requested),New_Value,Applied);
         else
            Core_Clamp_Subtract (Natural (Int_Field(Target,"points")),Natural(Int_Field(Target,"max")),Natural (-Requested),New_Value,Applied);
         end if;
         Set_Field(Target,"points",Integer(New_Value)); Effective:=(if Requested >= 0 then Integer(Applied) else -Integer(Applied)); return Success_Result(Op,E,Requested,Effective);
      elsif Op = "playbook-xp.clear" then declare X : constant JSON_Value := Get(Get(E,"playbook"),"experience"); begin Set_Field(X,"points",Integer'(0)); end;
      elsif Op = "action.set-rating" then
         declare
            Attrs : constant JSON_Array := Get(Get(E,"talent"),"attributes");
            Name  : constant String := Str_Field(B,"action");
            Rating : constant Integer := Int_Field(B,"rating");
            Found : Boolean := False;
         begin
            if Rating < 0 then
               return Validation_Error (Op, "invalid action rating",
                                        Root_Issues ("invalid action rating"), E);
            end if;
            for I in 1..Length(Attrs) loop
               declare Acts:constant JSON_Array:=Get(Get(Attrs,I),"actions");begin
                  for J in 1..Length(Acts) loop
                     declare X:constant JSON_Value:=Get(Acts,J);begin
                        if Str_Field(X,"name")=Name then
                           --  SC-A6: the SAME effective cap as
                           --  attribute.levelup — the server-computed
                           --  minimum of the raw max and the Mastery-derived
                           --  cap (published as effectiveActionCap).
                           declare
                              Cap : constant Integer :=
                                Integer'Min (Rating_Cap (E), Int_Field (X, "maxRating"));
                           begin
                              if Rating > Cap then
                                 return Rating_Maxed_Error
                                   (Op, "action rating capped by Mastery",
                                    Cap, Int_Field (X, "rating"), E);
                              end if;
                              Set_Field (X, "rating", Rating);
                              --  absolute-setter family: requested = target,
                              --  effective = stored target
                              Requested := Rating;
                              Effective := Rating;
                           end;
                           Found:=True;
                        end if;
                     end;
                  end loop;
               end;
            end loop;
            if not Found then
               return Validation_Error (Op, "unknown action",
                                        Root_Issues ("unknown action"), E);
            end if;
         end;
      elsif Op = "attribute-xp.add" or else Op = "attribute-xp.clear" or else Op="attribute.levelup" then
         declare Attrs:constant JSON_Array:=Get(Get(E,"talent"),"attributes");Name:constant String:=Str_Field(B,"attribute");Found:Boolean:=False;begin for I in 1..Length(Attrs) loop declare A:constant JSON_Value:=Get(Attrs,I);X:constant JSON_Value:=Get(A,"experience");begin if Str_Field(A,"name")=Name then Found:=True;if Op="attribute-xp.clear" then Set_Field(X,"points",Integer'(0));elsif Op="attribute-xp.add" then
            Requested:=Int_Field(B,"delta");
            --  SC-A6: signed-delta family — negative deltas reduce the track
            --  and clamp at zero (effective is the signed actual change).
            if Requested >= 0 then
               Core_Clamp_Add(Natural(Int_Field(X,"points")),Natural(Int_Field(X,"max")),Natural (Requested),New_Value,Applied);
            else
               Core_Clamp_Subtract(Natural(Int_Field(X,"points")),Natural(Int_Field(X,"max")),Natural (-Requested),New_Value,Applied);
            end if;
            Set_Field(X,"points",Integer(New_Value));Effective:=(if Requested >= 0 then Integer(Applied) else -Integer(Applied));
         else
            --  BUG-004: level-up must run through the proved core semantics —
            --  the attribute XP track must be FULL, and the target action
            --  rating must not exceed the shared effective cap (SC-A6: the
            --  same cap action.set-rating enforces — the server-computed
            --  minimum of the raw max and the Mastery-derived cap).
            declare
               use Paperclips_Core.Experience_Trackers;
               Track : Experience_Tracker (Maximum => Paperclips_Core.Capacity (Int_Field (X, "max")));
               Acts  : constant JSON_Array := Get (A, "actions");
               Rating_Max : Natural := 0;
               Tgt : JSON_Value;
               Found_Action : Boolean := False;
            begin
               Add (Track, Natural (Int_Field (X, "points")), Applied);
               for J in 1 .. Length (Acts) loop
                  declare Z : constant JSON_Value := Get (Acts, J); begin
                     if Str_Field (Z, "name") = Str_Field (B, "action") then
                        Tgt := Z; Found_Action := True;
                        Rating_Max := Natural
                          (Integer'Min (Rating_Cap (E), Int_Field (Z, "maxRating")));
                     end if;
                  end;
               end loop;
               if not Found_Action then
                  return Validation_Error
                    (Op, "unknown action",
                     Root_Issues ("unknown action"), E);
               end if;
               if not Is_Full (Track) then
                  return Cannot_Level_Up_Error
                    (Op, "attribute XP track is not full",
                     Int_Field (X, "max"), Int_Field (X, "points"), E);
               end if;
               if Natural (Int_Field (Tgt, "rating")) >= Rating_Max then
                  return Rating_Maxed_Error
                    (Op, "action rating at its effective cap",
                     Integer (Rating_Max), Int_Field (Tgt, "rating"), E);
               end if;
               Set_Field (Tgt, "rating", Int_Field (Tgt, "rating") + 1);
               Set_Field (X, "points", Integer'(0));
            end;
         end if;end if;end;end loop;if not Found then return Validation_Error (Op, "unknown attribute", Root_Issues ("unknown attribute"), E);end if;end;
      elsif Op="ability.take" then
         declare
            P:constant JSON_Value:=(if Kind="character" then Get(E,"playbook") else E);
            Field:constant String:=(if Kind="character" then "abilities" else "specialAbilities");
            A:constant JSON_Array:=Get(P,Field);O:JSON_Array:=A;
            Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;
         begin
            for I in 1..Length(A) loop
               if Str_Field(Get(A,I),"name")=Name then
                  Found:=True;
                  if not Can_Take_More(Kind,Name,E,Int_Field(Get(A,I),"timesTaken")) then
                     return Ability_Maxed_Error
                       (Op, "ability is already taken to its limit",
                        Ability_Take_Limit (Kind, Name, E),
                        Int_Field (Get(A,I),"timesTaken"), E);
                  end if;
                  Set_Field(Get(A,I),"timesTaken",Int_Field(Get(A,I),"timesTaken")+1);
               end if;
            end loop;
            if not Found then declare X:JSON_Value:=Create_Object;begin
               Set_Field(X,"name",Name);
               --  crews carry only name+timesTaken (C# CrewSpecialAbility);
               --  only characters embed the ability description.
               if Kind = "character" then
                  Set_Field(X,"description",Ability_Description(Kind,Name,E));
               end if;
               Set_Field(X,"timesTaken",Integer'(1));
               Append(O,X);Set_Field(P,Field,O);
            end;end if;
         end;
      elsif Op="ability.remove" then
         declare
            P:constant JSON_Value:=(if Kind="character" then Get(E,"playbook") else E);
            Field:constant String:=(if Kind="character" then "abilities" else "specialAbilities");
            A:constant JSON_Array:=(if Has_Field(P,Field) then Get(P,Field) else Empty_Array);
            O:JSON_Array:=Empty_Array;Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;
         begin
            for I in 1..Length(A) loop
               if Str_Field(Get(A,I),"name")=Name then Found:=True;
               else Append(O,Get(A,I));end if;
            end loop;
            if not Found then return Not_Found_Error(Op,"ability not found",E);end if;
            Set_Field(P,Field,O);
         end;
      elsif Op="fund.gain" or else Op="fund.spend" or else Op="fund.liquidate" then declare F:constant JSON_Value:=Get(E,"fund");S:constant JSON_Value:=Get(F,"satchel");Z:constant JSON_Value:=Get(F,"stash");Req:constant Integer:=Int_Field(B,"coins");A1,A2:Integer:=0;begin Requested:=Req;if Op="fund.gain" then A1:=Integer'Min(Req,Int_Field(S,"max")-Int_Field(S,"coins"));Set_Field(S,"coins",Int_Field(S,"coins")+A1);A2:=Integer'Min(Req-A1,Int_Field(Z,"max")-Int_Field(Z,"coins"));Set_Field(Z,"coins",Int_Field(Z,"coins")+A2);Effective:=A1+A2;return Success_Result(Op,E,Requested,Effective,Side=>(if Effective<Requested then Trim_Image(Requested-Effective)&" coin could not be stored" else ""));elsif Op="fund.spend" then
         --  SC-A6: the stash-to-coin conversion rate is the validated
         --  settings value (FundMaxima.StashToCoinRate), never a literal.
         declare Rate:constant Integer:=Settings_Int((To_Unbounded_String(Str_Field(E,"gameStem")),Game(Str_Field(E,"gameStem"))),"FundMaxima.StashToCoinRate",0);begin
         if Req>Int_Field(S,"coins")+Int_Field(Z,"coins")/Rate then return Insufficient_Funds_Error(Op,"not enough coins",Int_Field(S,"coins")+Int_Field(Z,"coins")/Rate,Req,E);end if;
         A1:=Integer'Min(Req,Int_Field(S,"coins"));Set_Field(S,"coins",Int_Field(S,"coins")-A1);Set_Field(Z,"coins",Int_Field(Z,"coins")-(Req-A1)*Rate);Effective:=Req;return Success_Result(Op,E,Requested,Effective);
         end;
      elsif Op="fund.liquidate" then
         declare Rate:constant Integer:=Settings_Int((To_Unbounded_String(Str_Field(E,"gameStem")),Game(Str_Field(E,"gameStem"))),"FundMaxima.StashToCoinRate",0);begin
         if Req>Int_Field(S,"max")-Int_Field(S,"coins") then return Satchel_Full_Error(Op,"satchel cannot hold that many coins",Int_Field(S,"max"),Int_Field(S,"coins"),E);end if;
         if Int_Field(Z,"coins")/Rate<Req then return Insufficient_Funds_Error(Op,"not enough stash to liquidate",Int_Field(Z,"coins")/Rate,Req,E);end if;
         Set_Field(Z,"coins",Int_Field(Z,"coins")-Req*Rate);Set_Field(S,"coins",Int_Field(S,"coins")+Req);Effective:=Req;return Success_Result(Op,E,Requested,Effective);
         end;
      end if;
      end;
      elsif Op="contact.add" and then Kind="character" then
         --  CONTRACT-05 correction: the REQUIRED canonical /contacts array.
         --  Duplicate name -> VALIDATION (human ruling; the crew op keeps
         --  DUPLICATE). New entries carry a server-generated id and
         --  closeness "contact". Stored documents are admission-gated
         --  (422 INVALID_ENTITY) before any mutation, so /contacts is
         --  always present here.
         declare A:constant JSON_Array:=Get(E,"contacts");Name:constant String:=Str_Field(B,"name");begin
            for I in 1..Length(A) loop
               if Str_Field(Get(A,I),"name")=Name then return Validation_Error(Op,"contact already exists",Root_Issues("contact already exists"),E);end if;
            end loop;
            declare X:JSON_Value:=Create_Object;O:JSON_Array:=A;begin
               Set_Field(X,"id",New_Id);Set_Field(X,"name",Name);Set_Field(X,"closeness","contact");
               Append(O,X);Set_Field(E,"contacts",O);
            end;
         end;
      elsif Op="contact.closeness" and then Kind="character" then
         --  CONTRACT-05: set the named contact's closeness
         --  (friend|contact|rival). Unknown name -> VALIDATION (ruling).
         declare A:constant JSON_Array:=Get(E,"contacts");Found:Boolean:=False;begin
            for I in 1..Length(A) loop
               if Str_Field(Get(A,I),"name")=Str_Field(B,"name") then Set_Field(Get(A,I),"closeness",Str_Field(B,"closeness"));Found:=True;end if;
            end loop;
            if not Found then return Validation_Error(Op,"contact not found",Root_Issues("contact not found"),E);end if;
         end;
      elsif Op="contact.remove" and then Kind="character" then
         --  CONTRACT-05: drop the named contact. Unknown name -> VALIDATION
         --  (ruling; the crew op keeps NOT_FOUND).
         declare A:constant JSON_Array:=Get(E,"contacts");O:JSON_Array:=Empty_Array;Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;begin
            for I in 1..Length(A) loop
               if Str_Field(Get(A,I),"name")=Name then Found:=True;else Append(O,Get(A,I));end if;
            end loop;
            if not Found then return Validation_Error(Op,"contact not found",Root_Issues("contact not found"),E);end if;
            Set_Field(E,"contacts",O);
         end;
      elsif Op="contact.add" then declare A:constant JSON_Array:=(if Has_Field(E,"contacts") then Get(E,"contacts") else Empty_Array);Name:constant String:=Str_Field(B,"name");begin for I in 1..Length(A) loop if Str_Field(Get(A,I),"name")=Name then return Duplicate_Error(Op,"contact already exists",E);end if;end loop;declare X:JSON_Value:=Create_Object;O:JSON_Array:=A;begin Set_Field(X,"name",Name);Set_Field(X,"profession",Str_Field(B,"profession"));Append(O,X);Set_Field(E,"contacts",O);end;end;
      elsif Op="contact.remove" then declare A:constant JSON_Array:=(if Has_Field(E,"contacts") then Get(E,"contacts") else Empty_Array);O:JSON_Array:=Empty_Array;Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;begin for I in 1..Length(A) loop if Str_Field(Get(A,I),"name")=Name then Found:=True;else Append(O,Get(A,I));end if;end loop;if not Found then return Not_Found_Error(Op,"contact not found",E);end if;Set_Field(E,"contacts",O);end;
      elsif Op="faction.set-status" then declare G:constant JSON_Value:=Game(Str_Field(E,"gameStem"));Lo:Integer:=Integer'First;Hi:Integer:=Integer'Last;begin if G.Kind=JSON_Object_Type and then Has_Field(G,"FactionStatus") then declare FS:constant JSON_Value:=Get(G,"FactionStatus");begin Lo:=Int_Field(FS,"Min",Integer'First);Hi:=Int_Field(FS,"Max",Integer'Last);end;end if;declare A:constant JSON_Array:=(if Has_Field(E,"factions") then Get(E,"factions") else Empty_Array);Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;begin Requested:=Int_Field(B,"status");Effective:=Integer'Min(Integer'Max(Requested,Lo),Hi);for I in 1..Length(A) loop if Str_Field(Get(A,I),"name")=Name then Set_Field(Get(A,I),"status",Effective);Found:=True;end if;end loop;if not Found then declare X:JSON_Value:=Create_Object;O:JSON_Array:=A;begin Set_Field(X,"name",Name);Set_Field(X,"status",Effective);Append(O,X);Set_Field(E,"factions",O);end;end if;end;return Success_Result(Op,E,Requested,Effective);end;
      elsif Op="faction.remove" then declare A:constant JSON_Array:=(if Has_Field(E,"factions") then Get(E,"factions") else Empty_Array);O:JSON_Array:=Empty_Array;Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;begin for I in 1..Length(A) loop if Str_Field(Get(A,I),"name")=Name then Found:=True;else Append(O,Get(A,I));end if;end loop;if not Found then return Not_Found_Error(Op,"faction not found",E);end if;Set_Field(E,"factions",O);end;
      elsif Op="dossier.update" then declare D:constant JSON_Value:=Get(E,"dossier");procedure Copy(Name:UTF8_String;Value:JSON_Value)is begin if Has_Field(D,Name) then Set_Field(D,Name,Clone(Value));end if;end;begin if Str_Field(B,"crewId")/="" and then Read_Entity("crew",Str_Field(B,"crewId")).Kind/=JSON_Object_Type then return Validation_Error(Op,"unknown crew",Root_Issues("unknown crew"),E);end if;Map_JSON_Object(B,Copy'Access);end;
      elsif Op = "note.add" or else Op = "note.remove" then
         declare
            P : constant JSON_Value := (if Kind = "character" then Get (E,"dossier") else E);
            A : constant JSON_Array := (if Has_Field (P,"notes") then Get (P,"notes") else Empty_Array);
            O : JSON_Array := Empty_Array; Idx : Natural := 0; Found : Boolean := False;
         begin
            if Op = "note.add" then O := A; Append (O, Create (Str_Field (B,"text")));
            else
               Idx := Natural (Int_Field (B,"index"));
               for I in 1 .. Length (A) loop
                  if I - 1 = Idx then Found := True; else Append (O, Get (A,I)); end if;
               end loop;
               if not Found then return Not_Found_Error (Op,"note index out of range",E); end if;
            end if;
            Set_Field (P,"notes",O);
         end;
      elsif Op = "heat.add" or else Op = "wanted.add" or else Op = "rep.add" then
         declare Name : constant String := (if Op="heat.add" then "heat" elsif Op="wanted.add" then "wanted" else "rep"); begin
            Target:=Get(E,Name);Requested:=Int_Field(B,"delta");
            if Requested >= 0 then Core_Clamp_Add(Natural(Int_Field(Target,"current")),Natural(Int_Field(Target,"max")),Natural(Requested),New_Value,Applied);
            else Core_Clamp_Subtract(Natural(Int_Field(Target,"current")),Natural(Int_Field(Target,"max")),Natural(-Requested),New_Value,Applied); end if;
            Set_Field(Target,"current",Integer(New_Value));Effective:=(if Requested >= 0 then Integer(Applied) else -Integer(Applied));return Success_Result(Op,E,Requested,Effective);
         end;
      elsif Op = "coin.add" or else Op = "stash.add" or else Op = "tier.add" then
         if Kind /= "crew" then return Validation_Error(Op,"crew-only operation",Root_Issues("crew-only operation"),E); end if;
         declare Name : constant String := (if Op="coin.add" then "coin" elsif Op="stash.add" then "stash" else "tier");
            Cur : constant Integer := Int_Field(E,Name); Req : constant Integer := Int_Field(B,"delta");
            --  CONTRACT-04: tier.add is bounded above by the validated
            --  CrewTierMax; stash.add by the vault-derived stashCapacity.
            --  coin.add keeps the historical floor-only bounds.  Fallback 0
            --  for unresolved settings mirrors the turf.add shape (SC-A6).
            Max : constant Integer :=
              (if Op = "tier.add" then
                 Settings_Int ((To_Unbounded_String (Str_Field (E, "gameStem")),
                                Game (Str_Field (E, "gameStem"))),
                               "CrewTierMax", 0)
               elsif Op = "stash.add" then Crew_Stash_Capacity (E)
               else Integer'Last);
         begin
            Requested := Req;
            if Req >= 0 then
               New_Value := (if Cur > Integer'Last - Req then Integer'Last else Cur + Req);
               New_Value := Integer'Min (New_Value, Max);
               Effective := Integer(New_Value) - Cur;
            else
               New_Value := (if Cur < Integer'First - Req or else Cur + Req <= 0 then 0 else Cur + Req);
               Effective := Integer(New_Value) - Cur;
            end if;
            Set_Field(E,Name,Integer(New_Value));return Success_Result(Op,E,Requested,Effective);
         end;
      elsif Op = "turf.add" then
         if Kind /= "crew" then return Error_Result (Op,"VALIDATION","crew-only operation",E); end if;
         declare Cur : constant Integer := Int_Field (E,"turf"); Req : constant Integer := Int_Field (B,"delta"); begin
            Requested := Req;
            --  SC-A6: the turf ceiling is the validated settings value
            --  (TurfMax), never a literal.
            declare
               Turf_Max : constant Integer :=
                 Settings_Int ((To_Unbounded_String (Str_Field (E, "gameStem")),
                                Game (Str_Field (E, "gameStem"))),
                               "TurfMax", 0);
            begin
               Effective := Integer'Min (Integer'Max (Req, -Cur), Turf_Max - Cur);
            end;
            Set_Field (E,"turf",Cur + Effective); return Success_Result (Op,E,Requested,Effective);
         end;
      elsif Op = "xp.add" then
         if Kind /= "crew" then return Validation_Error(Op,"crew-only operation",Root_Issues("crew-only operation"),E); end if;
         Target := Get (E,"experience"); Requested := Int_Field (B,"delta");
         --  SC-A6: signed-delta family — negative deltas reduce the track
         --  and clamp at zero (effective is the signed actual change).
         if Requested >= 0 then
            Core_Clamp_Add (Natural (Int_Field (Target,"points")),Natural (Int_Field (Target,"max")),Natural (Requested),New_Value,Applied);
         else
            Core_Clamp_Subtract (Natural (Int_Field (Target,"points")),Natural (Int_Field (Target,"max")),Natural (-Requested),New_Value,Applied);
         end if;
         Set_Field (Target,"points",Integer (New_Value)); Effective := (if Requested >= 0 then Integer (Applied) else -Integer (Applied)); return Success_Result (Op,E,Requested,Effective);
      elsif Op = "xp.clear" then
         if Kind /= "crew" then return Validation_Error(Op,"crew-only operation",Root_Issues("crew-only operation"),E); end if;
         declare X : constant JSON_Value := Get (E,"experience"); begin Set_Field (X,"points",Integer'(0)); end;
      elsif Op = "clock.progress" then
         declare
            use Paperclips_Core.Clocks;
            C   : Clock_State
              (Size => Paperclips_Core.Capacity (Int_Field (E, "size")));
            Req : constant Integer := Int_Field (B, "segments");
            App : Natural;
            Old_Seg, Old_Ov : Integer;
            Visible, Ov_Added, Eff : Integer;
            R, A : JSON_Value;
         begin
            C.Kind := (if Str_Field (E, "behavior", "bounded") = "rollover"
                       then Rollover else Project);
            Old_Seg := Int_Field (E, "segments");
            Old_Ov := Int_Field (E, "rollover", 0);
            C.Segments := Natural (Old_Seg);
            C.Overflow := Natural (Old_Ov);
            if Req >= 0 then
               --  SC-A7: the core accumulation primitive is bounded by its
               --  proven Pre (Capacity'Last delta, bounded carried
               --  overflow); the API boundary rejects deltas that could
               --  push past it (clock-taxonomy.mdx §10.4).
               if Req > Paperclips_Core.Capacity'Last
                 or else Old_Ov > Integer (Natural'Last - Paperclips_Core.Capacity'Last)
               then
                  return Validation_Error
                    (Op, "progress delta or carried overflow exceeds the supported bound",
                     Root_Issues ("progress delta or carried overflow exceeds the supported bound"), E);
               end if;
               Progress (C, Natural (Req), App);
            else
               --  W6 tug-of-war emptying: consume carried rollover FIRST,
               --  then empty visible segments, never below 0; the clamp
               --  shape preserves Overflow > 0 => Segments = Size
               --  (clock-taxonomy.mdx §10.2).
               declare
                  Size_LL : constant Long_Long_Integer :=
                    Long_Long_Integer (Int_Field (E, "size"));
                  Total : constant Long_Long_Integer :=
                    Long_Long_Integer (Old_Seg) + Long_Long_Integer (Old_Ov)
                    + Long_Long_Integer (Req);
               begin
                  if Total >= Size_LL then
                     C.Segments := C.Size;
                     C.Overflow := Natural
                       (Long_Long_Integer'Min (Total - Size_LL,
                                               Long_Long_Integer (Natural'Last)));
                  elsif Total > 0 then
                     C.Segments := Natural (Total);
                     C.Overflow := 0;
                  else
                     C.Segments := 0;
                     C.Overflow := 0;
                  end if;
               end;
            end if;
            Visible := Integer (C.Segments) - Old_Seg;
            Ov_Added := Integer (C.Overflow) - Old_Ov;
            Eff := Visible + Ov_Added;
            Set_Field (E, "segments", Integer (C.Segments));
            Set_Field (E, "rollover", Integer (C.Overflow));
            --  Q23 result family: requested/effective/visibleApplied/
            --  overflowAdded (CLOCK-RESULT-014).
            R := Create_Object;
            A := Create_Object;
            Set_Field (A, "op", Op);
            Set_Field (A, "requested", Req);
            Set_Field (A, "effective", Eff);
            Set_Field (A, "visibleApplied", Visible);
            Set_Field (A, "overflowAdded", Ov_Added);
            Set_Field (R, "ok", True);
            Set_Field (R, "applied", A);
            Set_Field (R, "sideEffects", Empty_Array);
            Set_Field (R, "error", JSON_Null);
            Set_Field (R, "clock", E);
            return R;
         end;
      elsif Op = "clock.reset" then
         declare
            use Paperclips_Core.Clocks;
            C : Clock_State
              (Size => Paperclips_Core.Capacity (Int_Field (E, "size")));
         begin
            C.Kind := (if Str_Field (E, "behavior", "bounded") = "rollover"
                       then Rollover else Project);
            C.Segments := Natural (Int_Field (E, "segments"));
            C.Overflow := Natural (Int_Field (E, "rollover", 0));
            Reset (C);
            Set_Field (E, "segments", Integer (C.Segments));
            Set_Field (E, "rollover", Integer (C.Overflow));
            return Success_Result (Op, E);
         end;
      elsif Op = "gear.lock" then declare X : constant JSON_Value := Get(E,"gear"); begin Set_Field(X,"isCommitmentLocked",True); end;
      elsif Op = "gear.unlock" then declare X : constant JSON_Value := Get(E,"gear"); begin Set_Field(X,"isCommitmentLocked",False); end;
      elsif Op = "gear.set-commitment" then
         if Bool_Field(Get(E,"gear"),"isCommitmentLocked") then return Error_Result(Op,"COMMITMENT_LOCKED","commitment is locked",E); end if;
         declare X : constant JSON_Value := Get(E,"gear"); begin Set_Field(X,"commitment",Str_Field(B,"commitment")); end;
      elsif Op = "gear.add" then
         declare G : constant JSON_Value := Get(E,"gear"); A : constant JSON_Array := Get(G,"availableGear"); Name : constant String := Str_Field(B,"name"); begin
            for I in 1..Length(A) loop
               if Str_Field(Get(A,I),"name") = Name then return Duplicate_Error(Op,"item already available",E); end if;
            end loop;
            declare O : JSON_Array := A; X : JSON_Value := Create_Object; begin
               Set_Field(X,"name",Name);Set_Field(X,"bulk",Int_Field(B,"bulk"));Append(O,X);Set_Field(G,"availableGear",O);
            end;
         end;
      elsif Op = "gear.remove" then
         declare G : constant JSON_Value := Get(E,"gear"); A : constant JSON_Array := Get(G,"availableGear"); L : constant JSON_Array := Get(G,"loadout"); Name : constant String := Str_Field(B,"name"); Found : Boolean := False; begin
            for I in 1..Length(A) loop
               if Str_Field(Get(A,I),"name") = Name then Found := True; end if;
            end loop;
            for I in 1..Length(L) loop
               if Str_Field(Get(L,I),"name") = Name then Found := True; end if;
            end loop;
            if not Found then return Not_Found_Error(Op,"item not found",E); end if;
            declare O : JSON_Array := Empty_Array; M : JSON_Array := Empty_Array; begin
               for I in 1..Length(A) loop
                  if Str_Field(Get(A,I),"name") /= Name then Append(O,Get(A,I)); end if;
               end loop;
               for I in 1..Length(L) loop
                  if Str_Field(Get(L,I),"name") /= Name then Append(M,Get(L,I)); end if;
               end loop;
               Set_Field(G,"availableGear",O);Set_Field(G,"loadout",M);
            end;
         end;
      elsif Op = "gear.commit" then
         declare G : constant JSON_Value := Get(E,"gear"); A : constant JSON_Array := Get(G,"availableGear"); L : constant JSON_Array := Get(G,"loadout"); Name : constant String := Str_Field(B,"name"); Item : JSON_Value := JSON_Null; begin
            if Bool_Field(G,"isCommitmentLocked") then return Commitment_Locked_Error(Op,"commitment is locked",E); end if;
            for I in 1..Length(A) loop
               if Str_Field(Get(A,I),"name") = Name then Item := Get(A,I); exit; end if;
            end loop;
            if Item.Kind = JSON_Null_Type then return Not_Found_Error(Op,"item not available",E); end if;
            if Str_Field(G,"commitment") = "" or else Str_Field(G,"commitment") = "none" then return No_Commitment_Error(Op,"no commitment set",E); end if;
            for I in 1..Length(L) loop
               if Str_Field(Get(L,I),"name") = Name then return Duplicate_Error(Op,"item already committed",E); end if;
            end loop;
            declare
               Sum : Integer := 0;
               --  SC-A3: capacity derives from the committed load level
               --  (settings LoadMaxima.CommitmentMaxBulk, C# fallback), not
               --  from a stored maxBulk literal.
               Capacity : constant Integer :=
                 Commitment_Max_Bulk
                   ((To_Unbounded_String (Str_Field (E, "gameStem")),
                     Game (Str_Field (E, "gameStem"))),
                    Str_Field (G, "commitment"));
            begin
               for I in 1..Length(L) loop Sum := Sum + Int_Field(Get(L,I),"bulk"); end loop;
               if Int_Field(Item,"bulk") > Capacity - Sum then
                  return Over_Bulk_Error(Op,"item exceeds bulk limit",Capacity,Sum,E);
               end if;
            end;
            declare O : JSON_Array := L; begin Append(O,Item);Set_Field(G,"loadout",O); end;
         end;
      elsif Op = "gear.uncommit" then
         declare G : constant JSON_Value := Get(E,"gear"); L : constant JSON_Array := Get(G,"loadout"); Name : constant String := Str_Field(B,"name"); Found : Boolean := False; begin
            if Bool_Field(G,"isCommitmentLocked") then return Commitment_Locked_Error(Op,"commitment is locked",E); end if;
            for I in 1..Length(L) loop
               if Str_Field(Get(L,I),"name") = Name then Found := True; end if;
            end loop;
            if not Found then return Not_Found_Error(Op,"item not in loadout",E); end if;
            declare O : JSON_Array := Empty_Array; begin
               for I in 1..Length(L) loop
                  if Str_Field(Get(L,I),"name") /= Name then Append(O,Get(L,I)); end if;
               end loop;
               Set_Field(G,"loadout",O);
            end;
         end;
      elsif Op = "gear.clear-commitments" then
         declare G : constant JSON_Value := Get(E,"gear"); begin
            if Bool_Field(G,"isCommitmentLocked") then return Commitment_Locked_Error(Op,"commitment is locked",E); end if;
            Set_Field(G,"loadout",Empty_Array);Set_Field(G,"commitment","none");
         end;
      elsif Op = "notebook.set" then Set_Field(E,"notebook",Str_Field(B,"text"));
      elsif Op = "hold.set" then Set_Field(E,"hold",Str_Field(B,"hold","weak"));
      elsif Op = "cohort.add" then
         declare Kind_Of : constant String := Str_Field(B,"cohortKind"); begin
            if Kind_Of /= "gang" and then Kind_Of /= "expert" then
               return Validation_Error (Op, "cohortKind must be gang or expert",
                                        Root_Issues ("cohortKind must be gang or expert"), E);
            end if;
            declare A : constant JSON_Array := Get(E,"cohorts"); O : JSON_Array := A; X : JSON_Value := Create_Object; begin
               Set_Field(X,"id",New_Id);Set_Field(X,"cohortKind",Kind_Of);
               Set_Field(X,"gangType",Str_Field(B,"gangType"));Set_Field(X,"expertType",Str_Field(B,"expertType"));
               Set_Field(X,"quality",Int_Field(B,"quality"));Set_Field(X,"scale",Int_Field(B,"scale"));
               Set_Field(X,"hasArmor",Bool_Field(B,"hasArmor"));
               Set_Field(X,"edges",(if Has_Field(B,"edges") then Get(B,"edges") else Empty_List));
               Set_Field(X,"flaws",(if Has_Field(B,"flaws") then Get(B,"flaws") else Empty_List));
               Set_Field(X,"harm","healthy");Set_Field(X,"description",Str_Field(B,"description"));
               Prepend(O,X);Set_Field(E,"cohorts",O);
            end;
         end;
      elsif Op = "cohort.remove" then
         declare A : constant JSON_Array := Get(E,"cohorts"); O : JSON_Array := Empty_Array;
            Id : constant String := Str_Field(B,"cohortId"); Found : Boolean := False;
         begin
            for I in 1..Length(A) loop
               if Str_Field(Get(A,I),"id") = Id then Found := True;
               else Append(O,Get(A,I)); end if;
            end loop;
            if not Found then return Not_Found_Error(Op,"cohort not found",E); end if;
            Set_Field(E,"cohorts",O);
         end;
      elsif Op = "cohort.update" then
         declare A : constant JSON_Array := Get(E,"cohorts"); Id : constant String := Str_Field(B,"cohortId"); Found : Boolean := False; begin
            for I in 1..Length(A) loop
               if Str_Field(Get(A,I),"id") = Id then
                  Found := True;
                  declare C : constant JSON_Value := Get(A,I);
                     procedure Copy (Name : UTF8_String; Value : JSON_Value) is
                     begin
                        if Has_Field(C,Name) then Set_Field(C,Name,Clone(Value)); end if;
                     end Copy;
                  begin
                     Map_JSON_Object (B, Copy'Access);
                  end;
               end if;
            end loop;
            if not Found then return Not_Found_Error(Op,"cohort not found",E); end if;
         end;
      elsif Op = "session.set" then
         declare
            S : constant JSON_Value := Get (E, "session");
            --  SC-A6: the session expression ceiling is the validated
            --  settings value (SessionExpressionMax); the stored max is
            --  settings-derived at creation, so this only guards a degraded
            --  stored document (no game-domain literal).
            Max : constant Integer := Int_Field
              (S, "max",
               Settings_Int ((To_Unbounded_String (Str_Field (E, "gameStem")),
                              Game (Str_Field (E, "gameStem"))),
                             "SessionExpressionMax", 0));
            Allowed : Boolean := True;
            procedure Check (Name : UTF8_String; Value : JSON_Value) is
            begin
               if Name /= "playbookExpressions" and then Name /= "characterExpressions"
                 and then Name /= "struggleExpressions" then Allowed := False; end if;
            end Check;
         begin
            Map_JSON_Object (B, Check'Access);
            if not Allowed then return Validation_Error (Op, "unknown field", Root_Issues ("unknown field"), E); end if;
            if Has_Field (B, "playbookExpressions") then
               Requested := Int_Field (B, "playbookExpressions");
               Core_Clamp_Add (0, Natural (Max), Natural'Max (0, Requested), New_Value, Applied);
               Set_Field (S, "playbookExpressions", Integer (New_Value));
               Effective := Integer (Applied);
            end if;
            if Has_Field (B, "characterExpressions") then
               Requested := Int_Field (B, "characterExpressions");
               Core_Clamp_Add (0, Natural (Max), Natural'Max (0, Requested), New_Value, Applied);
               Set_Field (S, "characterExpressions", Integer (New_Value));
               Effective := Integer (Applied);
            end if;
            if Has_Field (B, "struggleExpressions") then
               Requested := Int_Field (B, "struggleExpressions");
               Core_Clamp_Add (0, Natural (Max), Natural'Max (0, Requested), New_Value, Applied);
               Set_Field (S, "struggleExpressions", Integer (New_Value));
               Effective := Integer (Applied);
            end if;
            return Success_Result (Op, E, Requested, Effective);
         end;
      elsif Op="upgrade.mark" or else Op="upgrade.unmark" then declare A:constant JSON_Array:=Get(E,"upgrades");O:JSON_Array:=Empty_Array;Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;begin for I in 1..Length(A) loop declare X:constant JSON_Value:=Get(A,I);begin if Str_Field(X,"name")=Name then Found:=True;if Op="upgrade.mark" and then Int_Field(X,"boxesMarked")>=Upgrade_Total_Boxes(E,Name) then return Upgrade_Maxed_Error(Op,"upgrade is at its total box count",Upgrade_Total_Boxes(E,Name),Int_Field(X,"boxesMarked"),E);end if;declare N:constant Integer:=Int_Field(X,"boxesMarked")+(if Op="upgrade.mark" then 1 else -1);begin if N>0 then Set_Field(X,"boxesMarked",N);Append(O,X);end if;end;else Append(O,X);end if;end;end loop;if Op="upgrade.mark" and then not Found then declare X:JSON_Value:=Create_Object;begin Set_Field(X,"name",Name);Set_Field(X,"boxesMarked",Integer'(1));Append(O,X);end;end if;Set_Field(E,"upgrades",O);
         --  CONTRACT-04: marks changed, so the derived vault capacity moves
         --  with them.  An existing stash above a reduced capacity stays
         --  readable (never silently drop coin); the next stash.add
         --  reconciles downward.
         Set_Field(E,"stashCapacity",Crew_Stash_Capacity(E));end;
      elsif Op = "fields.update" then
         declare procedure Copy_Field (Name : UTF8_String; Value : JSON_Value) is begin if Has_Field(E,Name) then Set_Field(E,Name,Clone(Value)); end if; end; begin Map_JSON_Object(B,Copy_Field'Access); end;
      elsif Op = "update" then
         --  SC-A7: clock update (contract/openapi.yaml /clocks/{id}/update):
         --  ownerKind/ownerId (together), purpose, and relatedClockIds
         --  (replaces the full relationship set).  Mechanical fields are
         --  not editable here.  Reference validation (owner exists, related
         --  clocks exist, no self/duplicates) ran in Handle_Entity before
         --  Mutate.
         if Kind /= "clock" then
            return Validation_Error (Op, "clock-only operation",
                                      Root_Issues ("clock-only operation"), E);
         end if;
         if Has_Field (B, "ownerKind") then
            Set_Field (E, "ownerKind", Str_Field (B, "ownerKind"));
            Set_Field (E, "ownerId", Str_Field (B, "ownerId"));
         end if;
         if Has_Field (B, "purpose") then
            Set_Field (E, "purpose", Str_Field (B, "purpose"));
         end if;
         if Has_Field (B, "relatedClockIds") then
            Set_Field (E, "relatedClockIds", Clone (Get (B, "relatedClockIds")));
         end if;
      elsif Op = "harm.healing-clock" then
         declare
            use Paperclips_Core.Clocks;
            H       : constant JSON_Value := Get (Get (E, "monitor"), "harm");
            C       : constant JSON_Value := Get (H, "healingClock");
            Req     : constant Integer := Int_Field (B, "segments");
            Size    : constant Integer := Int_Field (C, "size");
            App     : Natural;
            Old_Seg, Old_Ov : Integer;
            Visible, Ov_Added, Eff : Integer;
            CS      : Clock_State (Size => Paperclips_Core.Capacity (Size));
            R, A    : JSON_Value;
         begin
            --  The healing clock is a fixed rollover clock
            --  (RecoveryClockSize); its progress family matches
            --  clock.progress (FV-007, NUM-CLOCK-004).
            CS.Kind := Rollover;
            Old_Seg := Int_Field (C, "segments");
            Old_Ov  := Int_Field (C, "rollover", 0);
            CS.Segments := Natural (Old_Seg);
            CS.Overflow := Natural (Old_Ov);
            if Req > 0 then
               --  Q24 accumulation: ADD new overflow to the existing
               --  rollover (never replace), via the proven core primitive.
               if Req > Paperclips_Core.Capacity'Last
                 or else Old_Ov > Integer (Natural'Last - Paperclips_Core.Capacity'Last)
               then
                  return Validation_Error
                    (Op, "healing progress delta or carried overflow exceeds the supported bound",
                     Root_Issues ("healing progress delta or carried overflow exceeds the supported bound"), E);
               end if;
               Progress (CS, Natural (Req), App);
            else
               --  non-negative family: a non-positive delta is a no-op.
               App := 0;
            end if;
            Visible := Integer (CS.Segments) - Old_Seg;
            Ov_Added := Integer (CS.Overflow) - Old_Ov;
            Eff := Visible + Ov_Added;
            Set_Field (C, "segments", Integer (CS.Segments));
            Set_Field (C, "rollover", Integer (CS.Overflow));
            --  Q23 result family: requested/effective/visibleApplied/
            --  overflowAdded (NUM-CLOCK-004).
            R := Create_Object;
            A := Create_Object;
            Set_Field (A, "op", Op);
            Set_Field (A, "requested", Req);
            Set_Field (A, "effective", Eff);
            Set_Field (A, "visibleApplied", Visible);
            Set_Field (A, "overflowAdded", Ov_Added);
            Set_Field (R, "ok", True);
            Set_Field (R, "applied", A);
            Set_Field (R, "sideEffects", Empty_Array);
            Set_Field (R, "error", JSON_Null);
            Set_Field (R, Str_Field (E, "kind"), E);
            return R;
         end;
      elsif Op = "harm.heal" then
         declare H:constant JSON_Value:=Get(Get(E,"monitor"),"harm");C:constant JSON_Value:=Get(H,"healingClock");Level:constant String:=Str_Field(B,"intensity");Desc:constant String:=Str_Field(B,"description");begin
            if Int_Field(C,"segments")<Int_Field(C,"size") then return Cannot_Heal_Error(Op,"healing clock is not full",Int_Field(C,"size"),Int_Field(C,"segments"),E);end if;
            declare A:constant JSON_Array:=Get(H,Level);O:JSON_Array:=Empty_Array;Skipped:Boolean:=False;begin
               for I in 1..Length(A) loop
                  if not Skipped and then String'(Get(Get(A,I)))=Desc then Skipped:=True;else Append(O,Get(A,I));end if;
               end loop;
               if not Skipped then return Not_Found_Error(Op,"harm not found",E);end if;
               Set_Field(H,Level,O);
            end;
            declare R:constant Integer:=Int_Field(C,"rollover");begin
               Set_Field(C,"segments",Integer'Min(R,Int_Field(C,"size")));
               Set_Field(C,"rollover",(if R>Int_Field(C,"size") then R-Int_Field(C,"size") else 0));
            end;
            Set_Field(E,"isDeadish",Array_Length(H,"fatal")>0);return Success_Result(Op,E);
         end;
      elsif Op = "claim.set" then
         --  Crew Claims: acquire/relinquish a claim.  The Lair and unknown
         --  claim IDs are rejected atomically; repeated state is a no-op.
         if Kind /= "crew" then
            return Validation_Error (Op, "crew-only operation", Root_Issues ("crew-only operation"), E);
         end if;
         declare
            Claim_Id : constant String := Str_Field (B, "claimId");
            Claimed  : constant Boolean := Bool_Field (B, "claimed");
            Is_Lair  : Boolean;
         begin
            if not Claim_Exists (E, Claim_Id, Is_Lair) then
               return Validation_Error (Op, "unknown claim", Root_Issues ("unknown claim"), E);
            end if;
            if Is_Lair then
               return Validation_Error (Op, "the lair is always controlled",
                                        Root_Issues ("the lair is always controlled"), E);
            end if;
            declare
               A : constant JSON_Array :=
                 (if Has_Field (E, "claimedClaimIds") then Get (E, "claimedClaimIds")
                  else Empty_Array);
               Found : Boolean := False;
               O     : JSON_Array := Empty_Array;
            begin
               for I in 1 .. Length (A) loop
                  declare S : constant UTF8_String := Get (Get (A, I)); begin
                     if S = Claim_Id then Found := True; end if;
                  end;
               end loop;
               if Claimed and then not Found then
                  --  CRW-02 fix (UX-008 proof path): acquiring ONE node must
                  --  keep every previously held claim — the crew's claim set
                  --  accumulates across ops, so start from the held list.
                  O := A;
                  Append (O, Create (Claim_Id));
                  Set_Field (E, "claimedClaimIds", O);
               elsif not Claimed and then Found then
                  for I in 1 .. Length (A) loop
                     declare S : constant UTF8_String := Get (Get (A, I)); begin
                        if S /= Claim_Id then
                           Append (O, Get (A, I));
                        end if;
                     end;
                  end loop;
                  Set_Field (E, "claimedClaimIds", O);
               end if;
            end;
         end;
      elsif Op = "claim.customize" then
         --  Crew Claims: write/merge a per-crew override for a canonical
         --  claim (name/description/effects inherit unless overridden).
         if Kind /= "crew" then
            return Validation_Error (Op, "crew-only operation", Root_Issues ("crew-only operation"), E);
         end if;
         declare
            Claim_Id : constant String := Str_Field (B, "claimId");
            Is_Lair  : Boolean;
            Ovs      : JSON_Array :=
              (if Has_Field (E, "claimOverrides") then Get (E, "claimOverrides")
               else Empty_Array);
            Found    : Boolean := False;
         begin
            if not Claim_Exists (E, Claim_Id, Is_Lair) then
               return Validation_Error (Op, "unknown claim", Root_Issues ("unknown claim"), E);
            end if;
            if Is_Lair then
               return Validation_Error (Op, "the lair cannot be customized",
                                        Root_Issues ("the lair cannot be customized"), E);
            end if;
            for I in 1 .. Length (Ovs) loop
               if Str_Field (Get (Ovs, I), "claimId") = Claim_Id then
                  --  merge supplied fields into the existing override
                  if Has_Field (B, "name") then Set_Field (Get (Ovs, I), "name", Str_Field (B, "name")); end if;
                  if Has_Field (B, "description") then Set_Field (Get (Ovs, I), "description", Str_Field (B, "description")); end if;
                  if Has_Field (B, "effects") then Set_Field (Get (Ovs, I), "effects", Clone (Get (B, "effects"))); end if;
                  Found := True;
               end if;
            end loop;
            if not Found then
               declare X : JSON_Value := Create_Object; begin
                  Set_Field (X, "claimId", Claim_Id);
                  if Has_Field (B, "name") then Set_Field (X, "name", Str_Field (B, "name")); end if;
                  if Has_Field (B, "description") then Set_Field (X, "description", Str_Field (B, "description")); end if;
                  if Has_Field (B, "effects") then Set_Field (X, "effects", Clone (Get (B, "effects"))); end if;
                  Append (Ovs, X);
               end;
            end if;
            Set_Field (E, "claimOverrides", Ovs);
         end;
      elsif Op = "claim.reset" then
         --  Crew Claims: delete the override for a claim, restoring defaults.
         if Kind /= "crew" then
            return Validation_Error (Op, "crew-only operation", Root_Issues ("crew-only operation"), E);
         end if;
         declare
            Claim_Id : constant String := Str_Field (B, "claimId");
            Is_Lair  : Boolean;
            Ovs      : JSON_Array :=
              (if Has_Field (E, "claimOverrides") then Get (E, "claimOverrides")
               else Empty_Array);
            O        : JSON_Array := Empty_Array;
         begin
            if not Claim_Exists (E, Claim_Id, Is_Lair) then
               return Validation_Error (Op, "unknown claim", Root_Issues ("unknown claim"), E);
            end if;
            for I in 1 .. Length (Ovs) loop
               if Str_Field (Get (Ovs, I), "claimId") /= Claim_Id then
                  Append (O, Get (Ovs, I));
               end if;
            end loop;
            Set_Field (E, "claimOverrides", O);
         end;
      elsif Op = "end-score" then
         --  BUG-005: composite helper — explicit flags only, one snapshot.
         if Kind /= "character" then
            return Validation_Error (Op, "character-only operation",
                                     Root_Issues ("character-only operation"), E);
         end if;
         --  LIFECYCLE-ENDSCORE-001: end-score can never erase an unresolved
         --  pending trauma.
         if Bool_Field (E, "traumaPending") then
            return Trauma_Required_Error
              (Op, "pending trauma must be resolved before end-score", E);
         end if;
         if Bool_Field (B, "clearArmorUsed", False) then
            declare A : constant JSON_Value := Get (Get (E, "monitor"), "armor"); begin
               Set_Field (A, "standardUsed", False);
               Set_Field (A, "heavyUsed", False);
               Set_Field (A, "specialUsed", False);
            end;
         end if;
         if Bool_Field (B, "resetLoadoutCommitment", False) then
            declare G : constant JSON_Value := Get (E, "gear"); begin
               if Bool_Field (G, "isCommitmentLocked") then
                  return Commitment_Locked_Error (Op, "commitment is locked", E);
               end if;
               Set_Field (G, "loadout", Empty_Array);
               Set_Field (G, "commitment", "none");
            end;
         end if;
         --  W15: a successful end-score always clears stress and releases
         --  the out-of-action state.
         Set_Field (Get (Get (E, "monitor"), "stress"), "current", Integer'(0));
         Set_Field (E, "isOutOfAction", False);
         Set_Field (E, "stressClearPending", False);
      elsif Op = "retire" then
         --  Q33: explicit retirement — confirmation-guarded, legal in any
         --  state below maximum trauma; already-retired is caught by the
         --  top gate (RETIRED).
         if Kind /= "character" then
            return Validation_Error (Op, "character-only operation",
                                     Root_Issues ("character-only operation"), E);
         end if;
         if not Bool_Field (B, "confirm") then
            return Confirm_Required_Error (Op, "confirm must be true", E);
         end if;
         Retire_Character;
      elsif Op = "end-downtime" then
         --  BUG-005: composite helper — clears session expressions and applies
         --  caller-supplied vice relief (GM judgment stays outside).
         if Kind /= "character" then
            return Validation_Error (Op, "character-only operation",
                                     Root_Issues ("character-only operation"), E);
         end if;
         declare
            S : constant JSON_Value := Get (E, "session");
         begin
            if Bool_Field (B, "clearSessionExpressions", False) then
               Set_Field (S, "playbookExpressions", Integer'(0));
               Set_Field (S, "characterExpressions", Integer'(0));
               Set_Field (S, "struggleExpressions", Integer'(0));
            end if;
         end;
         if Has_Field (B, "viceReliefStress") then
            declare
               M  : constant JSON_Value := Get (Get (E, "monitor"), "stress");
               Req : constant Integer := Int_Field (B, "viceReliefStress");
            begin
               if Req < 0 then
                  return Validation_Error
                    (Op, "viceReliefStress must be non-negative",
                     Root_Issues ("viceReliefStress must be non-negative"), E);
               end if;
               Requested := Req;
               Core_Clamp_Subtract (Natural (Int_Field (M, "current")),
                                    Natural (Int_Field (M, "max")),
                                    Natural (Req), New_Value, Applied);
               Set_Field (M, "current", Integer (New_Value));
               Effective := -Integer (Applied);
            end;
         end if;
      else return Validation_Error (Op,"unknown operation",Root_Issues ("unknown operation"),E);
      end if;
      --  BUG-006: armor availability is derived; refresh the stored flags
      --  after any gear or ability mutation.
      if Kind = "character" and then
        (Op = "gear.add" or else Op = "gear.remove" or else Op = "gear.commit"
         or else Op = "gear.uncommit" or else Op = "gear.clear-commitments"
         or else Op = "ability.take" or else Op = "ability.remove")
      then
         declare A : constant JSON_Value := Get (Get (E, "monitor"), "armor"); begin
            Set_Field (A, "hasStandard", Armor_Available (E, "standard"));
            Set_Field (A, "hasHeavy", Armor_Available (E, "heavy"));
            Set_Field (A, "hasSpecial", Armor_Available (E, "special"));
         end;
      end if;
      return Success_Result (Op,E,Requested,Effective);
   exception when Constraint_Error =>
      return Validation_Error (Op, "invalid operation arguments",
                               Root_Issues ("invalid operation arguments"), E);
   end Mutate;

   --  SC-A7: clock ownership and relationship reference validation
   --  (clock-taxonomy.mdx §5 rules 3 and 5; contract/openapi.yaml /clocks
   --  POST and /clocks/{id}/update).  Requires store access, so it runs in
   --  Handle_Entity (create and update paths) rather than in the pure
   --  request-shape validator.  Self_Id is the clock's own id ("" on
   --  create, where self-reference is impossible).
   function Check_Clock_Refs
     (B : JSON_Value; Self_Id : String; Bad : out Unbounded_String)
      return Boolean
   is
      Ok : Boolean := True;
      procedure Reject (Msg : String) is
      begin
         if Ok then Bad := To_Unbounded_String (Msg); Ok := False; end if;
      end Reject;
   begin
      if Has_Field (B, "ownerKind") or else Has_Field (B, "ownerId") then
         declare
            OK : constant String := Str_Field (B, "ownerKind", "");
            OI : constant String := Str_Field (B, "ownerId", "");
         begin
            if OK = "campaign" then
               if OI /= "" then
                  Reject ("campaign-owned clocks must have an empty ownerId");
               end if;
            elsif OK = "character" or else OK = "crew" then
               if OI = "" then
                  Reject ("ownerKind " & OK & " requires an ownerId");
               elsif not Ada.Directories.Exists (Current_File (OK, OI)) then
                  Reject ("ownerId does not reference an existing " & OK);
               end if;
            else
               Reject ("ownerKind must be campaign, character or crew");
            end if;
         end;
      end if;
      if Has_Field (B, "relatedClockIds")
        and then Get (B, "relatedClockIds").Kind = JSON_Array_Type
      then
         declare
            A : constant JSON_Array := Get (B, "relatedClockIds");
         begin
            for I in 1 .. Length (A) loop
               if Get (A, I).Kind /= JSON_String_Type then
                  Reject ("relatedClockIds entries must be strings");
               else
                  declare
                     RID : constant String := Get (Get (A, I));
                  begin
                     if Ok and then RID = Self_Id then
                        Reject ("relatedClockIds must not reference the clock itself");
                     end if;
                     for J in 1 .. I - 1 loop
                        if Ok and then String'(Get (Get (A, J))) = RID then
                           Reject ("relatedClockIds must not contain duplicates");
                           exit;
                        end if;
                     end loop;
                     if Ok and then not Ada.Directories.Exists (Current_File ("clock", RID)) then
                        Reject ("relatedClockIds entry does not reference an existing standalone clock");
                     end if;
                  end;
               end if;
            end loop;
         end;
      end if;
      return Ok;
   end Check_Clock_Refs;

end Pitd_Ops;
