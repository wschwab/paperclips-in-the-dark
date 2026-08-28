with Ada.Calendar;
with Ada.Directories;
with Ada.Strings.Fixed;
with Ada.Strings.Unbounded;
with GNATCOLL.JSON;
with Pitd_Common;
with Pitd_Error;

package body Pitd_Normalize is
   pragma SPARK_Mode (Off);

   use Ada.Strings.Unbounded;
   use GNATCOLL.JSON;
   use Pitd_Common;
   use Pitd_Error;
   use type Ada.Calendar.Time;

   --  SC-A2: opaque preview tokens (import/repair preview -> confirming
   --  apply).  Each token is bound to the route (kind/id), a SHA-256 of the
   --  exact previewed input (the submitted import entity, or the stored raw
   --  bytes for repair), the stored revision (or the sha256: content token
   --  for a degraded target) at preview time, and the previewed result.
   --  Tokens are single-use and expire after Preview_Token_Lifetime;
   --  staleness is detectable because the apply re-checks the bound input
   --  hash, revision, and content token against the current state and
   --  refuses with 409 STALE_REVISION when anything changed.
   Max_Preview_Tokens : constant := 64;
   Preview_Token_Lifetime : constant Duration := 30.0 * 60.0;
   Preview_Token_Table : array (1 .. Max_Preview_Tokens) of Preview_Token_Entry :=
     (others => (Token => Null_Unbounded_String, Kind => Null_Unbounded_String,
                 Id => Null_Unbounded_String, Input_Hash => Null_Unbounded_String,
                 Revision => -1, Content => Null_Unbounded_String, Doc => JSON_Null,
                 Outcome => Null_Unbounded_String, Needs => Empty_Array,
                 Issues => Empty_Array, Changes => Empty_Array,
                 Warnings => Empty_Array, Expires => Ada.Calendar.Clock,
                 Used => False));

   protected Preview_Token_Store is
      procedure Issue
        (Kind, Id, Input_Hash : String; Revision : Integer; Content : String;
         Doc : JSON_Value; Outcome : String;
         Needs, Issues, Changes, Warnings : JSON_Array;
         Token : out Unbounded_String);
      procedure Redeem
        (Token : String; Found, Used : out Boolean; E : out Preview_Token_Entry);
   private
      procedure Evict_Expired;
   end Preview_Token_Store;

   protected body Preview_Token_Store is
      procedure Evict_Expired is
      begin
         for I in Preview_Token_Table'Range loop
            if Length (Preview_Token_Table (I).Token) > 0
              and then Preview_Token_Table (I).Expires < Ada.Calendar.Clock
            then
               Preview_Token_Table (I).Token := Null_Unbounded_String;
            end if;
         end loop;
      end Evict_Expired;

      procedure Issue
        (Kind, Id, Input_Hash : String; Revision : Integer; Content : String;
         Doc : JSON_Value; Outcome : String;
         Needs, Issues, Changes, Warnings : JSON_Array;
         Token : out Unbounded_String)
      is
         Slot : Natural := 0;
      begin
         Evict_Expired;
         for I in Preview_Token_Table'Range loop
            if Length (Preview_Token_Table (I).Token) = 0 then
               Slot := I;
               exit;
            end if;
         end loop;
         if Slot = 0 then
            --  bounded: evict the oldest live token
            Slot := Preview_Token_Table'First;
            for I in Preview_Token_Table'First + 1 .. Preview_Token_Table'Last loop
               if Preview_Token_Table (I).Expires < Preview_Token_Table (Slot).Expires then
                  Slot := I;
               end if;
            end loop;
         end if;
         Preview_Token_Table (Slot) :=
           (Token => To_Unbounded_String ("pt-" & New_Snapshot_Id),
            Kind => To_Unbounded_String (Kind),
            Id => To_Unbounded_String (Id),
            Input_Hash => To_Unbounded_String (Input_Hash),
            Revision => Revision,
            Content => To_Unbounded_String (Content),
            Doc => Clone (Doc),
            Outcome => To_Unbounded_String (Outcome),
            Needs => Needs, Issues => Issues,
            Changes => Changes, Warnings => Warnings,
            Expires => Ada.Calendar.Clock + Preview_Token_Lifetime,
            Used => False);
         Token := Preview_Token_Table (Slot).Token;
      end Issue;

      procedure Redeem
        (Token : String; Found, Used : out Boolean; E : out Preview_Token_Entry)
      is
      begin
         Found := False;
         Used := False;
         for I in Preview_Token_Table'Range loop
            if To_String (Preview_Token_Table (I).Token) = Token then
               Found := True;
               Used := Preview_Token_Table (I).Used;
               E := Preview_Token_Table (I);
               if not Used then
                  --  single-use: any redemption attempt consumes the token
                  Preview_Token_Table (I).Used := True;
               end if;
               return;
            end if;
         end loop;
      end Redeem;
   end Preview_Token_Store;












   --  SC-A2: frozen whole-error union builders (contract/schemas/
   --  operation-result.json $defs/operationError).  Every branch carries
   --  code, status, message, retryable, recovery, and typed details;
   --  NORMALIZATION_REQUIRED additionally carries the preview member and
   --  the token (same value as details.previewToken).

   function Preview_Result_Value
     (Changes, Warnings, Needs : JSON_Array; Canonical : Boolean;
      Doc : JSON_Value; Token : String := "") return JSON_Value
   is
      R : JSON_Value := Create_Object;
   begin
      Set_Field (R, "changes", Changes);
      Set_Field (R, "document", Clone (Doc));
      Set_Field (R, "warnings", Warnings);
      if Length (Needs) > 0 then Set_Field (R, "needsInputPointers", Needs); end if;
      if Token /= "" then Set_Field (R, "previewToken", Token); end if;
      Set_Field (R, "canonical", Canonical);
      return R;
   end Preview_Result_Value;

   --  SC-A1 canonicalizer (R0 matrix).  Pure: never writes.
   --
   --  Normalizes a parsed entity document per the frozen schemas and the R0
   --  canonicalization matrix (docs/pages/contract/wave0/
   --  canonicalization-matrix.mdx): missing/null -> canonical defaults (D1/
   --  D2), lossless coercions (D3), legacy enum variants (D4 via L2),
   --  deterministic clamps (D5), unknown-key listings (D6), legacy shapes
   --  L1-L8 (D7), identity normalization (D8), needs-input pointers, sparse
   --  claimOverrides preserved as-is.  The result is the ordered change list
   --  {pointer, reason, previous, replacement} plus warnings and
   --  needs-input pointers, in the frozen previewResult shape.  SC-A2
   --  (import/repair transactions) and SC-A3 (stored admission) consume it.
   ---------------------------------------------------------------------------

   Allowed_Character : constant String :=
     "|kind|id|gameStem|gameName|language|revision|formatVersion|createdAt|" &
     "updatedAt|isRetired|isDeadish|traumaPending|isOutOfAction|" &
     "stressClearPending|dossier|monitor|talent|playbook|gear|fund|" &
     "contacts|session|notebook|";
   Allowed_Named_Desc : constant String := "|name|description|";
   Allowed_Vice : constant String := "|name|description|purveyor|";
   Allowed_Monitor : constant String := "|stress|trauma|harm|armor|";
   Allowed_Bounded : constant String := "|current|max|";
   Allowed_Trauma : constant String := "|traumas|max|";
   Allowed_Harm : constant String := "|lesser|moderate|severe|fatal|healingClock|";
   Allowed_Healing : constant String := "|segments|size|rollover|";
   Allowed_Armor : constant String :=
     "|standardUsed|heavyUsed|specialUsed|hasStandard|hasHeavy|hasSpecial|";
   Allowed_Dossier : constant String :=
     "|name|crewId|alias|look|notes|background|heritage|vice|";
   Allowed_Talent : constant String := "|attributes|";
   Allowed_Attribute : constant String := "|name|experience|actions|";
   Allowed_Action : constant String := "|name|rating|maxRating|";
   Allowed_Experience : constant String := "|points|max|";
   Allowed_Playbook : constant String := "|name|experience|abilities|";
   Allowed_Ability : constant String := "|name|description|timesTaken|";
   Allowed_Gear : constant String :=
     "|loadout|availableGear|commitment|isCommitmentLocked|maxBulk|";
   Allowed_Gear_Item : constant String := "|name|bulk|";
   Allowed_Fund : constant String := "|satchel|stash|";
   Allowed_Satchel : constant String := "|coins|max|";
   Allowed_Char_Contact : constant String := "|id|name|closeness|";
   Allowed_Session : constant String :=
     "|playbookExpressions|characterExpressions|struggleExpressions|max|";
   Allowed_Crew : constant String :=
     "|kind|id|gameStem|gameName|language|revision|formatVersion|createdAt|" &
     "updatedAt|crewTypeName|name|lair|reputation|huntingGrounds|tier|hold|" &
    "heat|wanted|rep|experience|specialAbilities|upgrades|cohorts|coin|" &
    "stash|stashCapacity|notes|turf|contacts|factions|claimedClaimIds|" &
    "claimOverrides|";
   Allowed_Spec_Ability : constant String := "|name|timesTaken|";
   Allowed_Upgrade : constant String := "|name|boxesMarked|";
   Allowed_Cohort : constant String :=
     "|id|cohortKind|gangType|expertType|quality|scale|hasArmor|edges|flaws|" &
     "harm|description|";
   Allowed_Contact : constant String := "|name|profession|";
   Allowed_Faction : constant String := "|name|status|";
   Allowed_Override : constant String := "|claimId|name|description|effects|";
   Allowed_Clock : constant String :=
     "|kind|id|revision|formatVersion|createdAt|updatedAt|name|ownerKind|" &
     "ownerId|purpose|behavior|segments|size|rollover|relatedClockIds|";

   --  Normalization context: ordered change list, warnings, needs-input
   --  pointers, and needs-input issues, accumulated in walk order (schema
   --  property order at every level — deterministic).
   type N_Ctx is record
      Changes  : JSON_Array := Empty_Array;
      Warnings : JSON_Array := Empty_Array;
      Needs    : JSON_Array := Empty_Array;
      Issues   : JSON_Array := Empty_Array;
   end record;

   procedure Add_Change
     (C : in out N_Ctx; Ptr, Reason : String;
      Prev, Repl : JSON_Value; Warning : String)
   is
      X : JSON_Value := Create_Object;
   begin
      Set_Field (X, "pointer", Ptr);
      Set_Field (X, "reason", Reason);
      Set_Field (X, "previous", Clone (Prev));
      Set_Field (X, "replacement", Clone (Repl));
      Append (C.Changes, X);
      Append (C.Warnings, Create (Warning));
   end Add_Change;

   procedure Add_Needs (C : in out N_Ctx; Ptr, Reason, Expected : String) is
   begin
      Append (C.Needs, Create (Ptr));
      Append (C.Issues, Issue_At (Ptr, Reason, Expected));
   end Add_Needs;

   --  Deterministic unknown-key iteration: GNATCOLL's object map order is
   --  not contractual, so keys are collected and sorted before reporting.
   --  BUG-013 Wave 2B: replaced the fixed 512-key buffer with an unbounded
   --  JSON_Array so objects with >512 keys never have their removals
   --  silently truncated.
   function Less_Keys (L, R : JSON_Value) return Boolean is
     (L.Kind = JSON_String_Type and then R.Kind = JSON_String_Type
      and then Get (L) < Get (R));

   function Collect_Keys (O : JSON_Value) return JSON_Array is
      K : JSON_Array := Empty_Array;
      procedure Add (Name : UTF8_String; Value : JSON_Value) is
      begin
         Append (K, Create (String (Name)));
      end Add;
   begin
      if O.Kind = JSON_Object_Type then Map_JSON_Object (O, Add'Access); end if;
      Sort (K, Less_Keys'Access);
      return K;
   end Collect_Keys;

   function In_Allowed (Name : String; Allowed : String) return Boolean is
   begin
      return Ada.Strings.Fixed.Index (Allowed, "|" & Name & "|") > 0;
   end In_Allowed;

   --  D6: unknown keys are never defaulted and never silently dropped —
   --  each is listed as a removal the preview must display.  Exempt names
   --  (pipe-wrapped, e.g. "|clockKind|") were converted by an explicit
   --  legacy rule and have their own change entry.
   procedure List_Removals
     (O : JSON_Value; Ptr, Allowed : String; C : in out N_Ctx;
      Exempt : String := "")
   is
      K : constant JSON_Array := Collect_Keys (O);
   begin
      for I in 1 .. Length (K) loop
         declare
            Name : constant String := Get (Get (K, I));
         begin
            if not In_Allowed (Name, Allowed)
              and then (Exempt = "" or else not In_Allowed (Name, Exempt))
            then
               declare
                  P : constant String := Ptr & "/" & Name;
                  V : constant JSON_Value := Get (O, Name);
                  E : JSON_Value := Create_Object;
               begin
                  Set_Field (E, "pointer", P);
                  Set_Field (E, "reason", "unknown-key removal");
                  Set_Field (E, "previous", Clone (V));
                  Set_Field (E, "replacement", JSON_Null);
                  Append (C.Changes, E);
                  Append (C.Warnings, Create
                            ("Unknown property " & P
                             & " will be removed (data loss); removal must be confirmed"));
               end;
            end if;
         end;
      end loop;
   end List_Removals;

   --  Hand-rolled pattern matchers (the generated validator owns strict
   --  admission; the canonicalizer needs the same vocabulary to decide
   --  whether a value is derivable).
   function Is_Hex (C : Character) return Boolean is
     (C in '0' .. '9' or else C in 'a' .. 'f');

   function Is_Uuid (S : String) return Boolean is
   begin
      if S'Length /= 36 then return False; end if;
      for I in S'Range loop
         declare
            P : constant Natural := I - S'First + 1;
         begin
            if P in 9 | 14 | 19 | 24 then
               if S (I) /= '-' then return False; end if;
            elsif P = 15 then
               if S (I) /= '4' then return False; end if;
            elsif P = 20 then
               if S (I) not in '8' | '9' | 'a' | 'b' then return False; end if;
            else
               if not Is_Hex (S (I)) then return False; end if;
            end if;
         end;
      end loop;
      return True;
   end Is_Uuid;

   function Is_Claim_Id (S : String) return Boolean is
   begin
      if S'Length = 0 then return False; end if;
      for I in S'Range loop
         if S (I) = '-' then
            if I = S'First or else I = S'Last then return False; end if;
            if S (I - 1) = '-' then return False; end if;
         elsif not (S (I) in 'a' .. 'z' or else S (I) in '0' .. '9') then
            return False;
         end if;
      end loop;
      return True;
   end Is_Claim_Id;

   function Valid_Stem (S : String) return Boolean is
   begin
      if S'Length = 0 then return False; end if;
      for I in S'Range loop
         if not (S (I) in 'a' .. 'z' or else S (I) in 'A' .. 'Z'
                 or else S (I) in '0' .. '9' or else S (I) = '-')
         then
            return False;
         end if;
      end loop;
      return True;
   end Valid_Stem;

   --  D3 lossless coercion: integer string <-> number.
   function Int_From_String (S : String; V : out Integer) return Boolean is
      N : Long_Long_Integer := 0;
      Neg : constant Boolean := S'Length > 0 and then S (S'First) = '-';
      First : constant Integer := (if Neg then S'First + 1 else S'First);
   begin
      if S'Length = 0 or else First > S'Last then return False; end if;
      for I in First .. S'Last loop
         if S (I) not in '0' .. '9' then return False; end if;
         N := N * 10 + Long_Long_Integer (Character'Pos (S (I)) - 48);
      end loop;
      if Neg then N := -N; end if;
      if N < Long_Long_Integer (Integer'First)
        or else N > Long_Long_Integer (Integer'Last)
      then
         return False;
      end if;
      V := Integer (N);
      return True;
   end Int_From_String;

   --  The owning campaign's gameStem, for the campaign-derived fill.
   function Campaign_Stem return String is
      F : constant String := To_String (Data_Root) & "/campaign.json";
   begin
      if not Ada.Directories.Exists (F) then return ""; end if;
      return Str_Field (Read (Read_File (F)), "gameStem");
   exception
      when others => return "";
   end Campaign_Stem;

--  L2: known legacy PascalCase enum variants (deterministic one-to-one;
   --  a variant not in the table is needs-input, never a guess).
   type Legacy_Pair is record
      From_V : Unbounded_String;
      To_V   : Unbounded_String;
   end record;
   type Legacy_Map is array (Positive range <>) of Legacy_Pair;

   Hold_Legacy : constant Legacy_Map :=
     ((To_Unbounded_String ("Strong"), To_Unbounded_String ("strong")),
      (To_Unbounded_String ("Weak"),   To_Unbounded_String ("weak")));
   Commitment_Legacy : constant Legacy_Map :=
     ((To_Unbounded_String ("None"),       To_Unbounded_String ("none")),
      (To_Unbounded_String ("Light"),      To_Unbounded_String ("light")),
      (To_Unbounded_String ("Normal"),     To_Unbounded_String ("normal")),
      (To_Unbounded_String ("Heavy"),      To_Unbounded_String ("heavy")),
      (To_Unbounded_String ("Encumbered"), To_Unbounded_String ("encumbered")));
   Cohort_Type_Legacy : constant Legacy_Map :=
     ((To_Unbounded_String ("Gang"),   To_Unbounded_String ("gang")),
      (To_Unbounded_String ("Expert"), To_Unbounded_String ("expert")));
   Cohort_Harm_Legacy : constant Legacy_Map :=
     ((To_Unbounded_String ("Healthy"),  To_Unbounded_String ("healthy")),
      (To_Unbounded_String ("Weakened"), To_Unbounded_String ("weakened")),
      (To_Unbounded_String ("Impaired"), To_Unbounded_String ("impaired")),
      (To_Unbounded_String ("Broken"),   To_Unbounded_String ("broken")),
      (To_Unbounded_String ("Dead"),     To_Unbounded_String ("dead")));

   --  Empty legacy map for enums without legacy variants.
   No_Legacy : constant Legacy_Map :=
     (1 .. 0 => (Null_Unbounded_String, Null_Unbounded_String));

   --  L3: canonical item member names with their C# camelCase/PascalCase
   --  spellings, used when a legacy dictionary item is converted.
   type Name_Pair is record
      Canon : Unbounded_String;
      Alt   : Unbounded_String;
   end record;
   type Name_Map is array (Positive range <>) of Name_Pair;

   Item_Field_Aliases : constant Name_Map :=
     ((To_Unbounded_String ("name"),        To_Unbounded_String ("Name")),
      (To_Unbounded_String ("description"), To_Unbounded_String ("Description")),
      (To_Unbounded_String ("timesTaken"),  To_Unbounded_String ("TimesTaken")),
      (To_Unbounded_String ("bulk"),        To_Unbounded_String ("Bulk")),
      (To_Unbounded_String ("rating"),      To_Unbounded_String ("Rating")),
      (To_Unbounded_String ("maxRating"),   To_Unbounded_String ("MaxRating")),
      (To_Unbounded_String ("points"),      To_Unbounded_String ("Points")),
      (To_Unbounded_String ("max"),         To_Unbounded_String ("Max")),
      (To_Unbounded_String ("boxesMarked"), To_Unbounded_String ("BoxesMarked")),
      (To_Unbounded_String ("experience"),  To_Unbounded_String ("Experience")),
      (To_Unbounded_String ("actions"),     To_Unbounded_String ("actionsByName")),
      (To_Unbounded_String ("actions"),     To_Unbounded_String ("ActionsByName")),
      (To_Unbounded_String ("profession"),  To_Unbounded_String ("Profession")));

   --  FILL string property (missing/null -> Default).
   function N_Str (O : JSON_Value; Name, Ptr : String; Default : String;
                   C : in out N_Ctx) return JSON_Value is
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (Default),
                     (if Has_Field (O, Name)
                      then "Property " & Ptr & " is null (null is never stored): "
                           & "normalized to canonical default "
                           & (if Default = "" then """" else Default)
                      else "Missing required property " & Ptr
                           & ": filled with canonical default "
                           & (if Default = "" then """" else Default)));
         return Create (Default);
      end if;
      declare V : constant JSON_Value := Get (O, Name); begin
         if V.Kind = JSON_String_Type then return Clone (V); end if;
         if V.Kind = JSON_Int_Type then
            declare N : constant Integer := Integer'(Get (V)); begin
               Add_Change (C, Ptr, "type coercion", Clone (V), Create (Trim_Image (N)),
                           "Property " & Ptr & " had type number, expected string: converted to "
                           & Trim_Image (N));
               return Create (Trim_Image (N));
            end;
         end if;
         Add_Needs (C, Ptr, "wrong type: cannot be converted to string", "a string value");
         return Clone (V);
      end;
   end N_Str;

   --  NEEDS-INPUT string property (minLength 1): no canonical default.
   function N_Str_Required (O : JSON_Value; Name, Ptr : String; C : in out N_Ctx;
                            Min_Len : Natural := 1) return JSON_Value is
   begin
      if Has_Field (O, Name) and then Get (O, Name).Kind /= JSON_Null_Type then
         declare V : constant JSON_Value := Get (O, Name); begin
            if V.Kind = JSON_String_Type then
               if Str_Field (O, Name)'Length >= Min_Len then return Clone (V); end if;
               Add_Needs (C, Ptr, "too short: needs at least " & Trim_Image (Min_Len)
                          & " character(s)", "a string of at least " & Trim_Image (Min_Len)
                          & " characters");
               return Clone (V);
            end if;
            Add_Needs (C, Ptr, "wrong type: expected a string", "a string value");
            return Clone (V);
         end;
      end if;
      Add_Needs (C, Ptr, "missing required property (no canonical default)",
                 "a caller-supplied value");
      return JSON_Null;
   end N_Str_Required;

   --  FILL boolean (missing/null -> False; "true"/"false" strings coerce).
   function N_Bool (O : JSON_Value; Name, Ptr : String; C : in out N_Ctx) return JSON_Value is
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (False),
                     "Missing required property " & Ptr & ": filled with canonical default false");
         return Create (False);
      end if;
      declare V : constant JSON_Value := Get (O, Name); begin
         if V.Kind = JSON_Boolean_Type then return Clone (V); end if;
         if V.Kind = JSON_String_Type then
            declare S : constant String := Str_Field (O, Name); begin
               if S = "true" then
                  Add_Change (C, Ptr, "type coercion", Clone (V), Create (True),
                              "Property " & Ptr & " had type string, expected boolean: converted to true");
                  return Create (True);
               elsif S = "false" then
                  Add_Change (C, Ptr, "type coercion", Clone (V), Create (False),
                              "Property " & Ptr & " had type string, expected boolean: converted to false");
                  return Create (False);
               end if;
            end;
         end if;
         Add_Needs (C, Ptr, "wrong type: expected a boolean", "true or false");
         return Clone (V);
      end;
   end N_Bool;

   --  FILL integer (missing/null -> Default; integer strings coerce; D5
   --  deterministic clamp to [Min, Max]).
   function N_Int (O : JSON_Value; Name, Ptr : String; Default : Integer;
                   C : in out N_Ctx; Min : Integer := Integer'First;
                   Max : Integer := Integer'Last) return JSON_Value is
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (Default),
                     "Missing required property " & Ptr
                     & ": filled with canonical default " & Trim_Image (Default));
         return Create (Default);
      end if;
      declare
         V : constant JSON_Value := Get (O, Name);
         N : Integer;
      begin
         if V.Kind = JSON_Int_Type then
            N := Integer'(Get (V));
         elsif V.Kind = JSON_String_Type then
            if not Int_From_String (Str_Field (O, Name), N) then
               Add_Needs (C, Ptr, "wrong type: non-integer string cannot be converted",
                          "an integer value");
               return Clone (V);
            end if;
            Add_Change (C, Ptr, "type coercion", Clone (V), Create (N),
                        "Property " & Ptr & " had type string, expected integer: converted to "
                        & Trim_Image (N));
         else
            Add_Needs (C, Ptr, "wrong type: cannot be converted to integer", "an integer value");
            return Clone (V);
         end if;
         if N < Min or else N > Max then
            declare B : constant Integer := Integer'Max (Min, Integer'Min (Max, N)); begin
               Add_Change (C, Ptr, "clamp", Create (N), Create (B),
                           "Property " & Ptr & " value " & Trim_Image (N)
                           & " is outside [" & Trim_Image (Min) & ", " & Trim_Image (Max)
                           & "]: clamped to " & Trim_Image (B));
               return Create (B);
            end;
         end if;
         return Create (N);
      end;
   end N_Int;

   --  DERIVED integer fill: settings value when the game stem resolves
   --  (C# fallback for a missing settings key), needs-input when the stem
   --  cannot be resolved (R0 matrix: "needs-input when gameStem unresolved").
   function N_Int_Derived (O : JSON_Value; Name, Ptr : String; S : Settings_Ref;
                           Key : String; Fallback : Integer; C : in out N_Ctx)
                          return JSON_Value
   is
   begin
      if Has_Field (O, Name) and then Get (O, Name).Kind /= JSON_Null_Type then
         declare V : constant JSON_Value := Get (O, Name); begin
            if V.Kind = JSON_Int_Type then
               if Integer'(Get (V)) < 0 then
                  Add_Change (C, Ptr, "clamp", Clone (V), Create (Integer'(0)),
                              "Property " & Ptr & " value " & Trim_Image (Integer'(Get (V)))
                              & " is below minimum 0: clamped to 0");
                  return Create (Integer'(0));
               end if;
               return Clone (V);
            end if;
            if V.Kind = JSON_String_Type then
               declare N : Integer; begin
                  if Int_From_String (Str_Field (O, Name), N) then
                     if N < 0 then
                        Add_Change (C, Ptr, "clamp", Clone (V), Create (Integer'(0)),
                                    "Property " & Ptr & " value " & Trim_Image (N)
                                    & " is below minimum 0: clamped to 0");
                        return Create (Integer'(0));
                     end if;
                     Add_Change (C, Ptr, "type coercion", Clone (V), Create (N),
                                 "Property " & Ptr & " had type string, expected integer: converted to "
                                 & Trim_Image (N));
                     return Create (N);
                  end if;
               end;
            end if;
            Add_Needs (C, Ptr, "wrong type: expected an integer", "an integer value");
            return Clone (V);
         end;
      end if;
      if S.G.Kind = JSON_Object_Type then
         declare Val : constant Integer := Settings_Int (S, Key, Fallback); begin
            Add_Change (C, Ptr, "derived fill", JSON_Null, Create (Val),
                        "Missing required property " & Ptr
                        & ": filled with settings-derived default " & Trim_Image (Val));
            return Create (Val);
         end;
      end if;
      Add_Needs (C, Ptr, "missing required property (settings-derived; gameStem unresolved)",
                 "a caller-supplied value");
      return JSON_Null;
   end N_Int_Derived;

   --  minimum-1 counters (timesTaken/boxesMarked): legacy dictionary items
   --  carry their value (L3); missing has no neutral value -> needs-input;
   --  present values clamp to the declared minimum (D5).
   function N_Min1 (O : JSON_Value; Name, Ptr : String; C : in out N_Ctx) return JSON_Value is
   begin
      if Has_Field (O, Name) and then Get (O, Name).Kind /= JSON_Null_Type then
         declare
            V : constant JSON_Value := Get (O, Name);
            N : Integer;
         begin
            if V.Kind = JSON_Int_Type then
               N := Integer'(Get (V));
            elsif V.Kind = JSON_String_Type then
               if not Int_From_String (Str_Field (O, Name), N) then
                  Add_Needs (C, Ptr, "wrong type: non-integer string cannot be converted",
                             "an integer value");
                  return Clone (V);
               end if;
               Add_Change (C, Ptr, "type coercion", Clone (V), Create (N),
                           "Property " & Ptr & " had type string, expected integer: converted to "
                           & Trim_Image (N));
            else
               Add_Needs (C, Ptr, "wrong type: expected an integer", "an integer value");
               return Clone (V);
            end if;
            if N < 1 then
               Add_Change (C, Ptr, "clamp", Create (N), Create (Integer'(1)),
                           "Property " & Ptr & " value " & Trim_Image (N)
                           & " is below minimum 1: clamped to 1");
               return Create (Integer'(1));
            end if;
            return Create (N);
         end;
      end if;
      Add_Needs (C, Ptr, "missing required property (no neutral value)",
                 "a caller-supplied value");
      return JSON_Null;
   end N_Min1;

   --  FILL enum with L2 legacy variant mapping; Default "" = no default
   --  (missing -> needs-input).
   function N_Enum (O : JSON_Value; Name, Ptr : String; C : in out N_Ctx;
                    Allowed : String; Legacy : Legacy_Map;
                    Default : String := "") return JSON_Value
   is
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         if Default /= "" then
            Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (Default),
                        "Missing required property " & Ptr
                        & ": filled with canonical default " & Default);
            return Create (Default);
         end if;
         Add_Needs (C, Ptr, "missing required property (no canonical default)",
                    "one of " & Allowed);
         return JSON_Null;
      end if;
      declare V : constant JSON_Value := Get (O, Name); begin
         if V.Kind /= JSON_String_Type then
            Add_Needs (C, Ptr, "wrong type: expected a string", "one of " & Allowed);
            return Clone (V);
         end if;
         declare
            S : constant String := Str_Field (O, Name);
         begin
            if In_Allowed (S, Allowed) then return Create (S); end if;
            for I in Legacy'Range loop
               if To_String (Legacy (I).From_V) = S then
                  Add_Change (C, Ptr, "legacy conversion (L2)", Create (S),
                              Create (To_String (Legacy (I).To_V)),
                              "Property " & Ptr & " value '" & S & "' is not in " & Allowed
                              & ": mapped from legacy variant to " & To_String (Legacy (I).To_V));
                  return Create (To_String (Legacy (I).To_V));
               end if;
            end loop;
            Add_Change (C, Ptr,
                        "needs-input: enum variant " & S & " not in " & Allowed
                        & ": requires caller-supplied value",
                        Create (S), JSON_Null,
                        "Property " & Ptr & " value '" & S & "' is not in " & Allowed
                        & ": not a known variant; requires a caller-supplied value");
            Add_Needs (C, Ptr,
                       "wrong enum value: " & S & " is not in " & Allowed
                       & ": not a known variant; requires a caller-supplied value",
                       "one of " & Allowed);
            return Create (S);
         end;
      end;
   end N_Enum;

   --  FILL array (missing/null -> []); wrong type -> needs-input.
   function N_Array (O : JSON_Value; Name, Ptr : String; C : in out N_Ctx) return JSON_Value is
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (Empty_Array),
                     "Missing required property " & Ptr & ": filled with canonical default []");
         return Create (Empty_Array);
      end if;
      declare V : constant JSON_Value := Get (O, Name); begin
         if V.Kind = JSON_Array_Type then return Clone (V); end if;
         Add_Needs (C, Ptr, "wrong type: expected an array", "an array value");
         return Clone (V);
      end;
   end N_Array;

   --  L1: notes are a string array; the legacy single string converts to a
   --  one-entry array ("" -> []).
   function N_Notes (O : JSON_Value; Name, Ptr : String; C : in out N_Ctx) return JSON_Value is
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (Empty_Array),
                     "Missing required property " & Ptr & ": filled with canonical default []");
         return Create (Empty_Array);
      end if;
      declare V : constant JSON_Value := Get (O, Name); begin
         if V.Kind = JSON_Array_Type then return Clone (V); end if;
         if V.Kind = JSON_String_Type then
            declare
               S : constant String := Str_Field (O, Name);
               A : JSON_Array := Empty_Array;
            begin
               if S /= "" then Append (A, Create (S)); end if;
               Add_Change (C, Ptr, "legacy conversion (L1)", Clone (V), Create (A),
                           "Legacy shape at " & Ptr
                           & ": converted per rule L1: notes string -> one-entry array");
               return Create (A);
            end;
         end if;
         Add_Needs (C, Ptr, "wrong type: expected an array of strings", "an array of strings");
         return Clone (V);
      end;
   end N_Notes;

   --  crewId: canonical empty = no crew link; non-empty must be a UUID.
   function N_Crew_Id (O : JSON_Value; Ptr : String; C : in out N_Ctx) return JSON_Value is
   begin
      if not Has_Field (O, "crewId") or else Get (O, "crewId").Kind = JSON_Null_Type then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (""),
                     "Missing required property " & Ptr & ": filled with canonical default """"");
         return Create ("");
      end if;
      declare V : constant JSON_Value := Get (O, "crewId"); begin
         if V.Kind = JSON_String_Type then
            declare S : constant String := Str_Field (O, "crewId"); begin
               if S = "" or else Is_Uuid (S) then return Create (S); end if;
               Add_Needs (C, Ptr, "wrong value: non-empty crewId must be a UUID",
                          "a UUID or empty string");
               return Create (S);
            end;
         end if;
         Add_Needs (C, Ptr, "wrong type: expected a string", "a UUID or empty string");
         return Clone (V);
      end;
   end N_Crew_Id;

   --  NEEDS-INPUT timestamps: no derivable value; the server stamps on
   --  apply (createdAt/updatedAt).
   function N_Timestamp (O : JSON_Value; Name, Ptr : String; C : in out N_Ctx) return JSON_Value is
   begin
      if Has_Field (O, Name) and then Get (O, Name).Kind = JSON_String_Type then
         return Clone (Get (O, Name));
      end if;
      Add_Needs (C, Ptr, "missing required property (no canonical default; server stamps on apply)",
                 "a caller-supplied ISO-8601 timestamp");
      return JSON_Null;
   end N_Timestamp;

   --  formatVersion: missing -> 1 (FILL, Q5); a present non-1 value is a
   --  future/unknown format and is rejected rather than rewritten.
   function N_Format_Version (O : JSON_Value; C : in out N_Ctx) return JSON_Value is
   begin
      if Has_Field (O, "formatVersion") and then Get (O, "formatVersion").Kind = JSON_Int_Type
        and then Int_Field (O, "formatVersion") = 1
      then
         return Create (Integer'(1));
      end if;
      if not Has_Field (O, "formatVersion") or else Get (O, "formatVersion").Kind = JSON_Null_Type then
         Add_Change (C, "/formatVersion", "missing/null fill", JSON_Null, Create (Integer'(1)),
                     "Missing required property /formatVersion: filled with canonical default 1");
         return Create (Integer'(1));
      end if;
      Add_Needs (C, "/formatVersion", "unknown format version; not normalized",
                 "format version 1");
      return Clone (Get (O, "formatVersion"));
   end N_Format_Version;

   --  FILL object with two empty strings (namedDescription).
   function N_Named_Desc (O : JSON_Value; Name, Ptr : String; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, Name).Kind = JSON_Object_Type then
         Src := Get (O, Name);
         List_Removals (Src, Ptr, Allowed_Named_Desc, C);
      else
         Add_Needs (C, Ptr, "wrong type: expected an object",
                    "an object with name and description");
         Src := Create_Object;
      end if;
      Set_Field (X, "name", N_Str (Src, "name", Ptr & "/name", "", C));
      Set_Field (X, "description", N_Str (Src, "description", Ptr & "/description", "", C));
      if Missing then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property " & Ptr & ": filled with canonical empty object");
      end if;
      return X;
   end N_Named_Desc;

   --  Dossier vice: name/description empty; purveyor is the L4 legacy fill
   --  (the C# DossierVice has no purveyor).
   function N_Vice (O : JSON_Value; Name, Ptr : String; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, Name).Kind = JSON_Object_Type then
         Src := Get (O, Name);
         List_Removals (Src, Ptr, Allowed_Vice, C);
      else
         Add_Needs (C, Ptr, "wrong type: expected an object",
                    "an object with name, description and purveyor");
         Src := Create_Object;
      end if;
      Set_Field (X, "name", N_Str (Src, "name", Ptr & "/name", "", C));
      Set_Field (X, "description", N_Str (Src, "description", Ptr & "/description", "", C));
      if Has_Field (Src, "purveyor") and then Get (Src, "purveyor").Kind /= JSON_Null_Type then
         if Get (Src, "purveyor").Kind = JSON_Object_Type then
            Set_Field (X, "purveyor", N_Named_Desc (Src, "purveyor", Ptr & "/purveyor", C));
         else
            Add_Needs (C, Ptr & "/purveyor", "wrong type: expected an object",
                       "an object with name and description");
            Set_Field (X, "purveyor", Clone (Get (Src, "purveyor")));
         end if;
      else
         declare P : JSON_Value := Create_Object; begin
            Set_Field (P, "name", Create (""));
            Set_Field (P, "description", Create (""));
            Add_Change (C, Ptr & "/purveyor", "legacy conversion (L4)", JSON_Null, Clone (P),
                        "Legacy shape at " & Ptr
                        & "/purveyor: converted per rule L4: missing purveyor filled with empty named description");
            Set_Field (X, "purveyor", P);
         end;
      end if;
      if Missing then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property " & Ptr & ": filled with canonical empty object");
      end if;
      return X;
   end N_Vice;

   --  FILL bounded-integer track {current: 0, max: settings-derived}.
   function N_Bounded (O : JSON_Value; Name, Ptr : String; S : Settings_Ref;
                       Key : String; Fallback : Integer; C : in out N_Ctx)
                      return JSON_Value
   is
      B : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, Name).Kind = JSON_Object_Type then
         Src := Get (O, Name);
         List_Removals (Src, Ptr, Allowed_Bounded, C);
      else
         Add_Needs (C, Ptr, "wrong type: expected an object",
                    "an object with current and max");
         Src := Create_Object;
      end if;
      Set_Field (B, "current", N_Int (Src, "current", Ptr & "/current", 0, C, Min => 0));
      Set_Field (B, "max", N_Int_Derived (Src, "max", Ptr & "/max", S, Key, Fallback, C));
      if Missing then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Clone (B),
                     "Missing required property " & Ptr & ": filled with canonical empty track");
      end if;
      return B;
   end N_Bounded;

   --  FILL experience track {points: 0, max: settings-derived}.
   function N_Experience (O : JSON_Value; Name, Ptr : String; S : Settings_Ref;
                          Key : String; Fallback : Integer; C : in out N_Ctx)
                         return JSON_Value
   is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, Name).Kind = JSON_Object_Type then
         Src := Get (O, Name);
         List_Removals (Src, Ptr, Allowed_Experience, C);
      else
         Add_Needs (C, Ptr, "wrong type: expected an object",
                    "an object with points and max");
         Src := Create_Object;
      end if;
      Set_Field (X, "points", N_Int (Src, "points", Ptr & "/points", 0, C, Min => 0));
      Set_Field (X, "max", N_Int_Derived (Src, "max", Ptr & "/max", S, Key, Fallback, C));
      if Missing then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property " & Ptr & ": filled with canonical empty track");
      end if;
      return X;
   end N_Experience;

   --  FILL embedded healing clock {segments: 0, size: settings-derived,
   --  rollover: 0}.
   function N_Healing_Clock (O : JSON_Value; Ptr : String; S : Settings_Ref;
                             C : in out N_Ctx) return JSON_Value
   is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "healingClock") or else Get (O, "healingClock").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "healingClock").Kind = JSON_Object_Type then
         Src := Get (O, "healingClock");
         List_Removals (Src, Ptr, Allowed_Healing, C);
      else
         Add_Needs (C, Ptr, "wrong type: expected an object",
                    "an object with segments, size and rollover");
         Src := Create_Object;
      end if;
      Set_Field (X, "segments", N_Int (Src, "segments", Ptr & "/segments", 0, C, Min => 0));
      Set_Field (X, "size", N_Int_Derived (Src, "size", Ptr & "/size", S,
                                           "RecoveryClockSize", 4, C));
      Set_Field (X, "rollover", N_Int (Src, "rollover", Ptr & "/rollover", 0, C, Min => 0));
      if Missing then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property " & Ptr & ": filled with canonical empty clock");
      end if;
      return X;
   end N_Healing_Clock;

   --  L3: the C# trauma SortedSet serializes as an array; canonical storage
   --  is sorted and de-duplicated.
   function N_Trauma_Set (O : JSON_Value; Ptr : String; C : in out N_Ctx) return JSON_Value is
      Max_Items : constant := 256;
      Buf : array (1 .. Max_Items) of Unbounded_String := (others => Null_Unbounded_String);
      Cnt : Natural := 0;
   begin
      if not Has_Field (O, "traumas") or else Get (O, "traumas").Kind = JSON_Null_Type then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (Empty_Array),
                     "Missing required property " & Ptr & ": filled with canonical default []");
         return Create (Empty_Array);
      end if;
      declare V : constant JSON_Value := Get (O, "traumas"); begin
         if V.Kind /= JSON_Array_Type then
            Add_Needs (C, Ptr, "wrong type: expected an array of strings", "an array of strings");
            return Clone (V);
         end if;
      end;
      declare
         A : constant JSON_Array := Get (O, "traumas");
         V : constant JSON_Value := Get (O, "traumas");
      begin
         for I in 1 .. Length (A) loop
            declare
               Item : constant JSON_Value := Get (A, I);
            begin
               if Item.Kind /= JSON_String_Type then
                  Add_Needs (C, Ptr & "/" & Trim_Image (I - 1),
                             "wrong type: expected a string", "a string item");
               else
                  declare
                     S : constant String := String'(Get (Item));
                     Dup : Boolean := False;
                  begin
                     --  de-duplicate (keep first occurrence)
                     for J in 1 .. Cnt loop
                        if To_String (Buf (J)) = S then Dup := True; exit; end if;
                     end loop;
                     if not Dup and then Cnt < Max_Items then
                        Cnt := Cnt + 1;
                        Buf (Cnt) := To_Unbounded_String (S);
                     end if;
                  end;
               end if;
            end;
         end loop;
         --  sort deterministically
         for I in 1 .. Cnt - 1 loop
            for J in I + 1 .. Cnt loop
               if To_String (Buf (J)) < To_String (Buf (I)) then
                  declare T : constant Unbounded_String := Buf (I); begin
                     Buf (I) := Buf (J);
                     Buf (J) := T;
                  end;
               end if;
            end loop;
         end loop;
         --  identical to the stored array?  (same length, same order)
         declare
            Same : Boolean := Length (A) = Cnt;
            O2 : JSON_Array := Empty_Array;
         begin
            if Same then
               for I in 1 .. Cnt loop
                  if To_String (Buf (I)) /= String'(Get (Get (A, I))) then Same := False; exit; end if;
               end loop;
            end if;
            for I in 1 .. Cnt loop Append (O2, Create (To_String (Buf (I)))); end loop;
            if not Same then
               Add_Change (C, Ptr, "legacy conversion (L3)", Clone (V), Create (O2),
                           "Legacy shape at " & Ptr
                           & ": converted per rule L3: trauma set sorted and de-duplicated");
            end if;
            return Create (O2);
         end;
      end;
   end N_Trauma_Set;

   --  FILL trauma track {traumas: [] (L3 SortedSet: sorted, de-duplicated),
   --  max: settings-derived}.
   function N_Traumas (O : JSON_Value; Ptr : String; S : Settings_Ref;
                       C : in out N_Ctx) return JSON_Value
   is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "trauma") or else Get (O, "trauma").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "trauma").Kind = JSON_Object_Type then
         Src := Get (O, "trauma");
         List_Removals (Src, Ptr, Allowed_Trauma, C);
      else
         Add_Needs (C, Ptr, "wrong type: expected an object",
                    "an object with traumas and max");
         Src := Create_Object;
      end if;
      Set_Field (X, "traumas", N_Trauma_Set (Src, Ptr & "/traumas", C));
      Set_Field (X, "max", N_Int_Derived (Src, "max", Ptr & "/max", S, "TraumaMax", 4, C));
      if Missing then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property " & Ptr & ": filled with canonical empty track");
      end if;
      return X;
   end N_Traumas;

   --  L3: C# dictionary {name: item} -> canonical array with a "name"
   --  member; keys sorted, item fields copied with C# field-name aliases.
   function Dict_To_Array (V : JSON_Value; Ptr : String; C : in out N_Ctx) return JSON_Array is
      K : constant JSON_Array := Collect_Keys (V);
      A : JSON_Array := Empty_Array;
   begin
      for I in 1 .. Length (K) loop
         declare
            Name : constant String := Get (Get (K, I));
            Src  : constant JSON_Value := Get (V, Name);
            Item : JSON_Value := Create_Object;
         begin
            if Src.Kind = JSON_Object_Type then
               for M in Item_Field_Aliases'Range loop
                  declare
                     CN : constant String := To_String (Item_Field_Aliases (M).Canon);
                     AN : constant String := To_String (Item_Field_Aliases (M).Alt);
                  begin
                     if Has_Field (Src, CN) then
                        Set_Field (Item, CN, Clone (Get (Src, CN)));
                     elsif AN /= "" and then Has_Field (Src, AN) then
                        Set_Field (Item, CN, Clone (Get (Src, AN)));
                     end if;
                  end;
               end loop;
            end if;
            Set_Field (Item, "name", Name);
            Append (A, Item);
         end;
      end loop;
      Add_Change (C, Ptr, "legacy conversion (L3)", Clone (V), Create (A),
                  "Legacy shape at " & Ptr
                  & ": converted per rule L3: dictionary -> array with name member (sorted by key)");
      return A;
   end Dict_To_Array;

   --  Item walker signature for array properties.
   type Item_Walker is access function
     (V : JSON_Value; Ptr : String; S : Settings_Ref; C : in out N_Ctx)
      return JSON_Value;

   function Items_Walked (A : JSON_Array; Ptr : String; S : Settings_Ref;
                          C : in out N_Ctx; Walk : Item_Walker) return JSON_Value
   is
      O : JSON_Array := Empty_Array;
   begin
      for I in 1 .. Length (A) loop
         declare
            V : constant JSON_Value := Get (A, I);
            P : constant String := Ptr & "/" & Trim_Image (I - 1);
         begin
            if V.Kind = JSON_Object_Type then
               Append (O, Walk (V, P, S, C));
            else
               Add_Needs (C, P, "wrong type: expected an object", "an object item");
               Append (O, Clone (V));
            end if;
         end;
      end loop;
      return Create (O);
   end Items_Walked;

   --  Shared array-property canonicalizer: missing -> [] fill; legacy
   --  dictionary (L3) or the legacy-named property -> converted; arrays
   --  walk their items.
   function N_Items (O : JSON_Value; Name, Legacy_Name, Ptr : String;
                     S : Settings_Ref; C : in out N_Ctx; Walk : Item_Walker;
                     L6 : Boolean := False)
                    return JSON_Value
   is
      Src : JSON_Value := JSON_Null;
      Used_Legacy : Boolean := False;
   begin
      if Has_Field (O, Name) and then Get (O, Name).Kind /= JSON_Null_Type then
         Src := Get (O, Name);
      elsif Legacy_Name /= "" and then Has_Field (O, Legacy_Name)
        and then Get (O, Legacy_Name).Kind /= JSON_Null_Type
      then
         Src := Get (O, Legacy_Name);
         Used_Legacy := True;
      end if;
      if Src.Kind = JSON_Null_Type then
         if L6 then
            --  C3-era crews lack contacts/factions (L6): the fill is a
            --  documented legacy conversion, not a plain missing-key fill.
            Add_Change (C, Ptr, "legacy conversion (L6)", JSON_Null, Create (Empty_Array),
                        "Legacy shape at " & Ptr
                        & ": converted per rule L6: missing " & Name & " filled with empty array");
         else
            Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (Empty_Array),
                        "Missing required property " & Ptr & ": filled with canonical default []");
         end if;
         return Create (Empty_Array);
      end if;
      if Src.Kind = JSON_Object_Type then
         return Items_Walked (Dict_To_Array (Src, Ptr, C), Ptr, S, C, Walk);
      end if;
      if Src.Kind = JSON_Array_Type then
         if Used_Legacy then
            Add_Change (C, Ptr, "legacy conversion (L3)", Clone (Src), Clone (Src),
                        "Legacy shape at " & Ptr & ": converted per rule L3: renamed property "
                        & Legacy_Name & " -> " & Name);
         end if;
         return Items_Walked (Get (O, (if Used_Legacy then Legacy_Name else Name)),
                              Ptr, S, C, Walk);
      end if;
      Add_Needs (C, Ptr, "wrong type: expected an array", "an array value");
      return Clone (Src);
   end N_Items;

   --  Character array items -------------------------------------------------

   function Ability_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                          C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Ability, C);
      Set_Field (X, "name", N_Str (V, "name", Ptr & "/name", "", C));
      Set_Field (X, "description", N_Str (V, "description", Ptr & "/description", "", C));
      Set_Field (X, "timesTaken", N_Min1 (V, "timesTaken", Ptr & "/timesTaken", C));
      return X;
   end Ability_Item;

   function Action_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                         C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Action, C);
      Set_Field (X, "name", N_Str (V, "name", Ptr & "/name", "", C));
      Set_Field (X, "rating", N_Int (V, "rating", Ptr & "/rating", 0, C, Min => 0));
      Set_Field (X, "maxRating",
                 N_Int_Derived (V, "maxRating", Ptr & "/maxRating", S,
                                "ActionPointMaximum", 4, C));
      return X;
   end Action_Item;

   function Attribute_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                            C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Attribute, C);
      Set_Field (X, "name", N_Str (V, "name", Ptr & "/name", "", C));
      Set_Field (X, "experience", N_Experience (V, "experience", Ptr & "/experience", S,
                                                "XpTrackMaxima.Attribute", 6, C));
      Set_Field (X, "actions", N_Items (V, "actions", "actionsByName",
                                        Ptr & "/actions", S, C, Action_Item'Access));
      return X;
   end Attribute_Item;

   function Gear_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                       C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Gear_Item, C);
      Set_Field (X, "name", N_Str_Required (V, "name", Ptr & "/name", C));
      Set_Field (X, "bulk", N_Int (V, "bulk", Ptr & "/bulk", 0, C, Min => 0));
      return X;
   end Gear_Item;

   function Char_Contact_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                               C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Char_Contact, C);
      --  identity: contact ids are server-generated; a missing or invalid
      --  id gets a fresh UUID as a previewed fill (no schema references
      --  them), the same rule as cohort ids.
      if Has_Field (V, "id") and then Get (V, "id").Kind = JSON_String_Type
        and then Is_Uuid (Str_Field (V, "id"))
      then
         Set_Field (X, "id", Clone (Get (V, "id")));
      else
         declare Nid : constant String := New_Id; begin
            Add_Change (C, Ptr & "/id", "identity normalization",
                        (if Has_Field (V, "id") then Get (V, "id") else JSON_Null),
                        Create (Nid),
                        "Missing or invalid contact id at " & Ptr
                        & "/id: filled with server-generated UUID " & Nid);
            Set_Field (X, "id", Create (Nid));
         end;
      end if;
      Set_Field (X, "name", N_Str_Required (V, "name", Ptr & "/name", C));
      --  CONTRACT-05 correction: closeness is exactly friend|contact|rival.
      --  Legacy close-friend values are NOT auto-migrated — a stored legacy
      --  value is needs-input (documented value migration, spec page).
      Set_Field (X, "closeness", N_Enum (V, "closeness", Ptr & "/closeness", C,
                                         "|friend|contact|rival|",
                                         No_Legacy));
      return X;
   end Char_Contact_Item;

   --  Crew array items ------------------------------------------------------

   function Spec_Ability_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                               C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Spec_Ability, C);
      Set_Field (X, "name", N_Str_Required (V, "name", Ptr & "/name", C));
      Set_Field (X, "timesTaken", N_Min1 (V, "timesTaken", Ptr & "/timesTaken", C));
      return X;
   end Spec_Ability_Item;

   function Upgrade_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                          C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Upgrade, C);
      Set_Field (X, "name", N_Str_Required (V, "name", Ptr & "/name", C));
      Set_Field (X, "boxesMarked", N_Min1 (V, "boxesMarked", Ptr & "/boxesMarked", C));
      return X;
   end Upgrade_Item;

   function Cohort_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                         C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Cohort, C);
      --  identity: cohort ids are server-generated; a missing or invalid id
      --  gets a fresh UUID as a previewed fill (no schema references them).
      if Has_Field (V, "id") and then Get (V, "id").Kind = JSON_String_Type
        and then Is_Uuid (Str_Field (V, "id"))
      then
         Set_Field (X, "id", Clone (Get (V, "id")));
      else
         declare Nid : constant String := New_Id; begin
            Add_Change (C, Ptr & "/id", "identity normalization",
                        (if Has_Field (V, "id") then Get (V, "id") else JSON_Null),
                        Create (Nid),
                        "Missing or invalid cohort id at " & Ptr
                        & "/id: filled with server-generated UUID " & Nid);
            Set_Field (X, "id", Create (Nid));
         end;
      end if;
      Set_Field (X, "cohortKind", N_Enum (V, "cohortKind", Ptr & "/cohortKind", C,
                                          "|gang|expert|", Cohort_Type_Legacy));
      Set_Field (X, "gangType", N_Str (V, "gangType", Ptr & "/gangType", "", C));
      Set_Field (X, "expertType", N_Str (V, "expertType", Ptr & "/expertType", "", C));
      Set_Field (X, "quality", N_Int (V, "quality", Ptr & "/quality", 0, C, Min => 0));
      Set_Field (X, "scale", N_Int (V, "scale", Ptr & "/scale", 0, C, Min => 0));
      Set_Field (X, "hasArmor", N_Bool (V, "hasArmor", Ptr & "/hasArmor", C));
      Set_Field (X, "edges", N_Array (V, "edges", Ptr & "/edges", C));
      Set_Field (X, "flaws", N_Array (V, "flaws", Ptr & "/flaws", C));
      Set_Field (X, "harm", N_Enum (V, "harm", Ptr & "/harm", C,
                                    "|healthy|weakened|impaired|broken|dead|",
                                    Cohort_Harm_Legacy, Default => "healthy"));
      Set_Field (X, "description", N_Str (V, "description", Ptr & "/description", "", C));
      return X;
   end Cohort_Item;

   function Contact_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                          C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Contact, C);
      Set_Field (X, "name", N_Str_Required (V, "name", Ptr & "/name", C));
      Set_Field (X, "profession", N_Str (V, "profession", Ptr & "/profession", "", C));
      return X;
   end Contact_Item;

   function N_Faction_Status (O : JSON_Value; Ptr : String; S : Settings_Ref;
                              C : in out N_Ctx) return JSON_Value is
      Lo, Hi : Integer;
   begin
      Lo := Integer'First;
      Hi := Integer'Last;
      if S.G.Kind = JSON_Object_Type and then Has_Field (S.G, "FactionStatus") then
         declare FS : constant JSON_Value := Get (S.G, "FactionStatus"); begin
            if Has_Field (FS, "Min") and then Get (FS, "Min").Kind = JSON_Int_Type then
               Lo := Int_Field (FS, "Min", Integer'First);
            end if;
            if Has_Field (FS, "Max") and then Get (FS, "Max").Kind = JSON_Int_Type then
               Hi := Int_Field (FS, "Max", Integer'Last);
            end if;
         end;
      end if;
      return N_Int (O, "status", Ptr, 0, C, Min => Lo, Max => Hi);
   end N_Faction_Status;

   function Faction_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                          C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Faction, C);
      Set_Field (X, "name", N_Str_Required (V, "name", Ptr & "/name", C));
      Set_Field (X, "status", N_Faction_Status (V, Ptr & "/status", S, C));
      return X;
   end Faction_Item;

   --  Sparse overlay items (Q2/Q3): only claimId is required; absent
   --  name/description/effects mean "inherit the canonical game-setting
   --  value" and are never filled.
   function Override_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                           C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Override, C);
      if Has_Field (V, "claimId") and then Get (V, "claimId").Kind = JSON_String_Type
        and then Is_Claim_Id (Str_Field (V, "claimId"))
      then
         Set_Field (X, "claimId", Create (Str_Field (V, "claimId")));
      else
         Add_Needs (C, Ptr & "/claimId",
                    "missing or invalid claimId (cannot guess which claim is overridden)",
                    "a claim id matching ^[a-z0-9]+(?:-[a-z0-9]+)*$");
         Set_Field (X, "claimId",
                    (if Has_Field (V, "claimId") then Clone (Get (V, "claimId")) else JSON_Null));
      end if;
      --  SPARSE name/description: absent = inherit (never filled); present
      --  but empty violates minLength 1 -> needs-input; null is never
      --  stored and drops back to absent.
      if Has_Field (V, "name") then
         if Get (V, "name").Kind = JSON_String_Type then
            if Str_Field (V, "name") /= "" then
               Set_Field (X, "name", Create (Str_Field (V, "name")));
            else
               Add_Needs (C, Ptr & "/name", "present but empty override name",
                          "a non-empty string or absent (inherit)");
            end if;
         elsif Get (V, "name").Kind /= JSON_Null_Type then
            Add_Needs (C, Ptr & "/name", "wrong type: expected a string",
                       "a non-empty string or absent (inherit)");
         end if;
      end if;
      if Has_Field (V, "description") then
         if Get (V, "description").Kind = JSON_String_Type then
            if Str_Field (V, "description") /= "" then
               Set_Field (X, "description", Create (Str_Field (V, "description")));
            else
               Add_Needs (C, Ptr & "/description", "present but empty override description",
                          "a non-empty string or absent (inherit)");
            end if;
         elsif Get (V, "description").Kind /= JSON_Null_Type then
            Add_Needs (C, Ptr & "/description", "wrong type: expected a string",
                       "a non-empty string or absent (inherit)");
         end if;
      end if;
      --  SPARSE effects: absent = inherit; a present array (even empty) is
      --  semantically distinct and preserved as-is.
      if Has_Field (V, "effects") and then Get (V, "effects").Kind /= JSON_Null_Type then
         if Get (V, "effects").Kind = JSON_Array_Type then
            Set_Field (X, "effects", Clone (Get (V, "effects")));
         else
            Add_Needs (C, Ptr & "/effects", "wrong type: expected an array",
                       "an array or absent (inherit)");
         end if;
      end if;
      return X;
   end Override_Item;

   --  claimedClaimIds: claim-id pattern items, de-duplicated (uniqueItems).
   function N_Claimed_Ids (O : JSON_Value; Ptr : String; C : in out N_Ctx) return JSON_Value is
   begin
      if not Has_Field (O, "claimedClaimIds") or else Get (O, "claimedClaimIds").Kind = JSON_Null_Type then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (Empty_Array),
                     "Missing required property " & Ptr & ": filled with canonical default []");
         return Create (Empty_Array);
      end if;
      declare V : constant JSON_Value := Get (O, "claimedClaimIds"); begin
         if V.Kind /= JSON_Array_Type then
            Add_Needs (C, Ptr, "wrong type: expected an array", "an array of claim ids");
            return Clone (V);
         end if;
      end;
      declare
         A : constant JSON_Array := Get (O, "claimedClaimIds");
         V : constant JSON_Value := Get (O, "claimedClaimIds");
         O2 : JSON_Array := Empty_Array;
         Dropped : Boolean := False;
      begin
         for I in 1 .. Length (A) loop
            declare
               Item : constant JSON_Value := Get (A, I);
               P : constant String := Ptr & "/" & Trim_Image (I - 1);
            begin
               if Item.Kind /= JSON_String_Type then
                  Add_Needs (C, P, "wrong type: expected a string", "a claim id");
                  Append (O2, Clone (Item));
               else
                  declare S : constant String := String'(Get (Item)); begin
                  if not Is_Claim_Id (S) then
                     Add_Needs (C, P, "wrong value: not a claim id",
                                "a claim id matching ^[a-z0-9]+(?:-[a-z0-9]+)*$");
                     Append (O2, Create (S));
                  else
                     declare Dup : Boolean := False; begin
                        for J in 1 .. Length (O2) loop
                           if String'(Get (Get (O2, J))) = S then Dup := True; exit; end if;
                        end loop;
                        if Dup then Dropped := True;
                        else Append (O2, Create (S));
                        end if;
                     end;
                  end if;
                  end;
               end if;
            end;
         end loop;
         if Dropped then
            Add_Change (C, Ptr, "uniqueItems", Clone (V), Create (O2),
                        "Property " & Ptr & " contains duplicate items: de-duplicated");
         end if;
         return Create (O2);
      end;
   end N_Claimed_Ids;

   --  Entity walkers --------------------------------------------------------

   function N_Dossier (O : JSON_Value; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "dossier") or else Get (O, "dossier").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "dossier").Kind = JSON_Object_Type then
         Src := Get (O, "dossier");
         List_Removals (Src, "/dossier", Allowed_Dossier, C);
      else
         Add_Needs (C, "/dossier", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "name", N_Str (Src, "name", "/dossier/name", "", C));
      Set_Field (X, "crewId", N_Crew_Id (Src, "/dossier/crewId", C));
      Set_Field (X, "alias", N_Str (Src, "alias", "/dossier/alias", "", C));
      Set_Field (X, "look", N_Str (Src, "look", "/dossier/look", "", C));
      Set_Field (X, "notes", N_Notes (Src, "notes", "/dossier/notes", C));
      Set_Field (X, "background", N_Named_Desc (Src, "background", "/dossier/background", C));
      Set_Field (X, "heritage", N_Named_Desc (Src, "heritage", "/dossier/heritage", C));
      Set_Field (X, "vice", N_Vice (Src, "vice", "/dossier/vice", C));
      if Missing then
         Add_Change (C, "/dossier", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /dossier: filled with canonical empty dossier");
      end if;
      return X;
   end N_Dossier;

   function N_Harm (O : JSON_Value; S : Settings_Ref; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "harm") or else Get (O, "harm").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "harm").Kind = JSON_Object_Type then
         Src := Get (O, "harm");
         List_Removals (Src, "/monitor/harm", Allowed_Harm, C);
      else
         Add_Needs (C, "/monitor/harm", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "lesser", N_Array (Src, "lesser", "/monitor/harm/lesser", C));
      Set_Field (X, "moderate", N_Array (Src, "moderate", "/monitor/harm/moderate", C));
      Set_Field (X, "severe", N_Array (Src, "severe", "/monitor/harm/severe", C));
      Set_Field (X, "fatal", N_Array (Src, "fatal", "/monitor/harm/fatal", C));
      Set_Field (X, "healingClock", N_Healing_Clock (Src, "/monitor/harm/healingClock", S, C));
      if Missing then
         Add_Change (C, "/monitor/harm", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /monitor/harm: filled with canonical empty harm");
      end if;
      return X;
   end N_Harm;

   function N_Armor (O : JSON_Value; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "armor") or else Get (O, "armor").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "armor").Kind = JSON_Object_Type then
         Src := Get (O, "armor");
         List_Removals (Src, "/monitor/armor", Allowed_Armor, C);
      else
         Add_Needs (C, "/monitor/armor", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "standardUsed", N_Bool (Src, "standardUsed", "/monitor/armor/standardUsed", C));
      Set_Field (X, "heavyUsed", N_Bool (Src, "heavyUsed", "/monitor/armor/heavyUsed", C));
      Set_Field (X, "specialUsed", N_Bool (Src, "specialUsed", "/monitor/armor/specialUsed", C));
      Set_Field (X, "hasStandard", N_Bool (Src, "hasStandard", "/monitor/armor/hasStandard", C));
      Set_Field (X, "hasHeavy", N_Bool (Src, "hasHeavy", "/monitor/armor/hasHeavy", C));
      Set_Field (X, "hasSpecial", N_Bool (Src, "hasSpecial", "/monitor/armor/hasSpecial", C));
      if Missing then
         Add_Change (C, "/monitor/armor", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /monitor/armor: filled with canonical empty armor");
      end if;
      return X;
   end N_Armor;

   function N_Monitor (O : JSON_Value; S : Settings_Ref; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "monitor") or else Get (O, "monitor").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "monitor").Kind = JSON_Object_Type then
         Src := Get (O, "monitor");
         List_Removals (Src, "/monitor", Allowed_Monitor, C);
      else
         Add_Needs (C, "/monitor", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "stress", N_Bounded (Src, "stress", "/monitor/stress", S, "StressMax", 9, C));
      Set_Field (X, "trauma", N_Traumas (Src, "/monitor/trauma", S, C));
      Set_Field (X, "harm", N_Harm (Src, S, C));
      Set_Field (X, "armor", N_Armor (Src, C));
      if Missing then
         Add_Change (C, "/monitor", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /monitor: filled with canonical empty monitor");
      end if;
      return X;
   end N_Monitor;

   function N_Talent (O : JSON_Value; S : Settings_Ref; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "talent") or else Get (O, "talent").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "talent").Kind = JSON_Object_Type then
         Src := Get (O, "talent");
         List_Removals (Src, "/talent", Allowed_Talent, C);
      else
         Add_Needs (C, "/talent", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "attributes", N_Items (Src, "attributes", "attributesByName",
                                           "/talent/attributes", S, C, Attribute_Item'Access));
      if Missing then
         Add_Change (C, "/talent", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /talent: filled with canonical empty talent");
      end if;
      return X;
   end N_Talent;

   function N_Playbook (O : JSON_Value; S : Settings_Ref; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "playbook") or else Get (O, "playbook").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "playbook").Kind = JSON_Object_Type then
         Src := Get (O, "playbook");
         List_Removals (Src, "/playbook", Allowed_Playbook, C);
      else
         Add_Needs (C, "/playbook", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "name", N_Str (Src, "name", "/playbook/name", "", C));
      Set_Field (X, "experience", N_Experience (Src, "experience", "/playbook/experience", S,
                                                "XpTrackMaxima.Playbook", 8, C));
      Set_Field (X, "abilities", N_Items (Src, "abilities", "abilitiesByName",
                                          "/playbook/abilities", S, C, Ability_Item'Access));
      if Missing then
         Add_Change (C, "/playbook", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /playbook: filled with canonical empty playbook");
      end if;
      return X;
   end N_Playbook;

   --  gear.maxBulk derives from the commitment level (C# LoadCommitmentOption).
   function Commitment_Max_Bulk (S : Settings_Ref; Commitment : String) return Integer is
   begin
      if S.G.Kind = JSON_Object_Type and then Has_Field (S.G, "LoadMaxima") then
         declare L : constant JSON_Value := Get (S.G, "LoadMaxima"); begin
            if Has_Field (L, "CommitmentMaxBulk") then
               declare M : constant JSON_Value := Get (L, "CommitmentMaxBulk"); begin
                  if Commitment = "none" then return 0;
                  elsif Commitment = "light" then return Int_Field (M, "Light", 3);
                  elsif Commitment = "normal" then return Int_Field (M, "Normal", 5);
                  elsif Commitment = "heavy" then return Int_Field (M, "Heavy", 6);
                  elsif Commitment = "encumbered" then return Int_Field (M, "Encumbered", 9);
                  end if;
               end;
            end if;
         end;
      end if;
      if Commitment = "none" then return 0;
      elsif Commitment = "light" then return 3;
      elsif Commitment = "normal" then return 5;
      elsif Commitment = "heavy" then return 6;
      else return 9;
      end if;
   end Commitment_Max_Bulk;

   function N_Gear (O : JSON_Value; S : Settings_Ref; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
      Commit : Unbounded_String := Null_Unbounded_String;
   begin
      if not Has_Field (O, "gear") or else Get (O, "gear").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "gear").Kind = JSON_Object_Type then
         Src := Get (O, "gear");
         List_Removals (Src, "/gear", Allowed_Gear, C);
      else
         Add_Needs (C, "/gear", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "loadout", N_Items (Src, "loadout", "loadoutByName",
                                        "/gear/loadout", S, C, Gear_Item'Access));
      Set_Field (X, "availableGear", N_Items (Src, "availableGear", "availableGearByName",
                                              "/gear/availableGear", S, C, Gear_Item'Access));
      declare CV : constant JSON_Value := N_Enum (Src, "commitment", "/gear/commitment", C,
                                                  "|none|light|normal|heavy|encumbered|",
                                                  Commitment_Legacy, Default => "none"); begin
         if CV.Kind = JSON_String_Type then
            Commit := To_Unbounded_String (String'(Get (CV)));
         end if;
         Set_Field (X, "commitment", CV);
      end;
      Set_Field (X, "isCommitmentLocked",
                 N_Bool (Src, "isCommitmentLocked", "/gear/isCommitmentLocked", C));
      if Has_Field (Src, "maxBulk") and then Get (Src, "maxBulk").Kind /= JSON_Null_Type then
         Set_Field (X, "maxBulk",
                    N_Int_Derived (Src, "maxBulk", "/gear/maxBulk", S,
                                   "LoadMaxima.MaxBulk", 9, C));
      elsif To_String (Commit) = "none" or else To_String (Commit) = "light"
        or else To_String (Commit) = "normal" or else To_String (Commit) = "heavy"
        or else To_String (Commit) = "encumbered"
      then
         declare Val : constant Integer := Commitment_Max_Bulk (S, To_String (Commit)); begin
            Add_Change (C, "/gear/maxBulk", "derived fill", JSON_Null, Create (Val),
                        "Missing required property /gear/maxBulk: filled with commitment-derived default "
                        & Trim_Image (Val));
            Set_Field (X, "maxBulk", Create (Val));
         end;
      else
         Add_Needs (C, "/gear/maxBulk",
                    "missing required property (commitment unresolved)",
                    "a caller-supplied value");
         Set_Field (X, "maxBulk", JSON_Null);
      end if;
      if Missing then
         Add_Change (C, "/gear", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /gear: filled with canonical empty gear");
      end if;
      return X;
   end N_Gear;

   function N_Satchel (O : JSON_Value; Name, Ptr : String; S : Settings_Ref;
                       Key : String; Fallback : Integer; C : in out N_Ctx)
                      return JSON_Value
   is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, Name).Kind = JSON_Object_Type then
         Src := Get (O, Name);
         List_Removals (Src, Ptr, Allowed_Satchel, C);
      else
         Add_Needs (C, Ptr, "wrong type: expected an object",
                    "an object with coins and max");
         Src := Create_Object;
      end if;
      Set_Field (X, "coins", N_Int (Src, "coins", Ptr & "/coins", 0, C, Min => 0));
      Set_Field (X, "max", N_Int_Derived (Src, "max", Ptr & "/max", S, Key, Fallback, C));
      if Missing then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property " & Ptr & ": filled with canonical empty fund");
      end if;
      return X;
   end N_Satchel;

   function N_Fund (O : JSON_Value; S : Settings_Ref; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "fund") or else Get (O, "fund").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "fund").Kind = JSON_Object_Type then
         Src := Get (O, "fund");
         List_Removals (Src, "/fund", Allowed_Fund, C);
      else
         Add_Needs (C, "/fund", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "satchel", N_Satchel (Src, "satchel", "/fund/satchel", S,
                                          "FundMaxima.SatchelMax", 4, C));
      Set_Field (X, "stash", N_Satchel (Src, "stash", "/fund/stash", S,
                                        "FundMaxima.StashMax", 40, C));
      if Missing then
         Add_Change (C, "/fund", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /fund: filled with canonical empty fund");
      end if;
      return X;
   end N_Fund;

   --  CONTRACT-05 correction: the character relationship list is the
   --  REQUIRED canonical contacts array (the evolved rolodex surface).
   --  Missing/null fills with the empty array like every other required
   --  property; items normalize through Char_Contact_Item.
   function N_Char_Contacts (O : JSON_Value; C : in out N_Ctx) return JSON_Value is
      No_Settings : Settings_Ref;
   begin
      return N_Items (O, "contacts", "", "/contacts", No_Settings, C,
                      Char_Contact_Item'Access);
   end N_Char_Contacts;

   function N_Session (O : JSON_Value; S : Settings_Ref; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "session") or else Get (O, "session").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "session").Kind = JSON_Object_Type then
         Src := Get (O, "session");
         List_Removals (Src, "/session", Allowed_Session, C);
      else
         Add_Needs (C, "/session", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "playbookExpressions",
                 N_Int (Src, "playbookExpressions", "/session/playbookExpressions", 0, C, Min => 0));
      Set_Field (X, "characterExpressions",
                 N_Int (Src, "characterExpressions", "/session/characterExpressions", 0, C, Min => 0));
      Set_Field (X, "struggleExpressions",
                 N_Int (Src, "struggleExpressions", "/session/struggleExpressions", 0, C, Min => 0));
      Set_Field (X, "max", N_Int_Derived (Src, "max", "/session/max", S,
                                          "SessionExpressionMax", 2, C));
      if Missing then
         Add_Change (C, "/session", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /session: filled with canonical empty session");
      end if;
      return X;
   end N_Session;

   function Canonicalize_Character
     (V : JSON_Value; Kind, Id : String; C : in out N_Ctx) return JSON_Value
   is
      O : JSON_Value := Create_Object;
      Stem : Unbounded_String := Null_Unbounded_String;
      S : Settings_Ref;
      G_Name : Unbounded_String := Null_Unbounded_String;
   begin
      List_Removals (V, "", Allowed_Character, C);
      --  identity (Q15): kind/id come from the route
      if Has_Field (V, "kind") and then Get (V, "kind").Kind = JSON_String_Type
        and then Str_Field (V, "kind") = Kind
      then
         Set_Field (O, "kind", Kind);
      else
         Add_Change (C, "/kind", "identity normalization",
                     (if Has_Field (V, "kind") then Get (V, "kind") else JSON_Null),
                     Create (Kind),
                     "Body kind does not match route " & Kind
                     & ": normalized to route identity (directory is authoritative)");
         Set_Field (O, "kind", Kind);
      end if;
      if Has_Field (V, "id") and then Get (V, "id").Kind = JSON_String_Type
        and then Str_Field (V, "id") = Id
      then
         Set_Field (O, "id", Id);
      else
         Add_Change (C, "/id", "identity normalization",
                     (if Has_Field (V, "id") then Get (V, "id") else JSON_Null),
                     Create (Id),
                     "Body id does not match route " & Id
                     & ": normalized to route identity (directory is authoritative)");
         Set_Field (O, "id", Id);
      end if;
      --  gameStem: campaign-derived fill when missing; invalid pattern is
      --  needs-input; all DERIVED fills depend on it.
      if Has_Field (V, "gameStem") and then Get (V, "gameStem").Kind = JSON_String_Type
        and then Valid_Stem (Str_Field (V, "gameStem"))
      then
         Stem := To_Unbounded_String (Str_Field (V, "gameStem"));
         Set_Field (O, "gameStem", Create (To_String (Stem)));
      elsif not Has_Field (V, "gameStem") or else Get (V, "gameStem").Kind = JSON_Null_Type then
         declare CS : constant String := Campaign_Stem; begin
            if CS /= "" then
               Stem := To_Unbounded_String (CS);
               Add_Change (C, "/gameStem", "derived fill", JSON_Null, Create (CS),
                           "Missing required property /gameStem: filled with campaign-derived default "
                           & CS);
               Set_Field (O, "gameStem", Create (CS));
            else
               Add_Needs (C, "/gameStem", "missing required property (no campaign context)",
                          "a caller-supplied value");
               Set_Field (O, "gameStem", JSON_Null);
            end if;
         end;
      else
         Add_Needs (C, "/gameStem", "wrong gameStem value",
                    "a value matching ^[A-Za-z0-9-]+$");
         Set_Field (O, "gameStem", Clone (Get (V, "gameStem")));
      end if;
      S := (To_Unbounded_String (To_String (Stem)), Game (To_String (Stem)));
      if S.G.Kind = JSON_Object_Type then
         G_Name := To_Unbounded_String (Str_Field (S.G, "Name"));
      end if;
      --  gameName/language: settings Name/Language offered as a previewed
      --  fill when the game stem resolves; canonical empty otherwise.
      Set_Field (O, "gameName", N_Str (V, "gameName", "/gameName", To_String (G_Name), C));
      Set_Field (O, "language", N_Str (V, "language", "/language",
                                       (if S.G.Kind = JSON_Object_Type
                                        then Str_Field (S.G, "Language", "English") else ""),
                                       C));
      Set_Field (O, "revision", N_Int (V, "revision", "/revision", 1, C, Min => 1));
      Set_Field (O, "formatVersion", N_Format_Version (V, C));
      Set_Field (O, "createdAt", N_Timestamp (V, "createdAt", "/createdAt", C));
      Set_Field (O, "updatedAt", N_Timestamp (V, "updatedAt", "/updatedAt", C));
      Set_Field (O, "isRetired", N_Bool (V, "isRetired", "/isRetired", C));
      Set_Field (O, "isDeadish", N_Bool (V, "isDeadish", "/isDeadish", C));
      Set_Field (O, "traumaPending", N_Bool (V, "traumaPending", "/traumaPending", C));
      Set_Field (O, "isOutOfAction", N_Bool (V, "isOutOfAction", "/isOutOfAction", C));
      Set_Field (O, "stressClearPending", N_Bool (V, "stressClearPending", "/stressClearPending", C));
      Set_Field (O, "dossier", N_Dossier (V, C));
      Set_Field (O, "monitor", N_Monitor (V, S, C));
      Set_Field (O, "talent", N_Talent (V, S, C));
      Set_Field (O, "playbook", N_Playbook (V, S, C));
      Set_Field (O, "gear", N_Gear (V, S, C));
      Set_Field (O, "fund", N_Fund (V, S, C));
      Set_Field (O, "contacts", N_Char_Contacts (V, C));
      Set_Field (O, "session", N_Session (V, S, C));
      Set_Field (O, "notebook", N_Str (V, "notebook", "/notebook", "", C));
      return O;
   end Canonicalize_Character;

   function Canonicalize_Crew
     (V : JSON_Value; Kind, Id : String; C : in out N_Ctx) return JSON_Value
   is
      O : JSON_Value := Create_Object;
      Stem : Unbounded_String := Null_Unbounded_String;
      S : Settings_Ref;
      G_Name : Unbounded_String := Null_Unbounded_String;
   begin
      List_Removals (V, "", Allowed_Crew, C);
      --  identity (Q15)
      if Has_Field (V, "kind") and then Get (V, "kind").Kind = JSON_String_Type
        and then Str_Field (V, "kind") = Kind
      then
         Set_Field (O, "kind", Kind);
      else
         Add_Change (C, "/kind", "identity normalization",
                     (if Has_Field (V, "kind") then Get (V, "kind") else JSON_Null),
                     Create (Kind),
                     "Body kind does not match route " & Kind
                     & ": normalized to route identity (directory is authoritative)");
         Set_Field (O, "kind", Kind);
      end if;
      if Has_Field (V, "id") and then Get (V, "id").Kind = JSON_String_Type
        and then Str_Field (V, "id") = Id
      then
         Set_Field (O, "id", Id);
      else
         Add_Change (C, "/id", "identity normalization",
                     (if Has_Field (V, "id") then Get (V, "id") else JSON_Null),
                     Create (Id),
                     "Body id does not match route " & Id
                     & ": normalized to route identity (directory is authoritative)");
         Set_Field (O, "id", Id);
      end if;
      --  gameStem resolution
      if Has_Field (V, "gameStem") and then Get (V, "gameStem").Kind = JSON_String_Type
        and then Valid_Stem (Str_Field (V, "gameStem"))
      then
         Stem := To_Unbounded_String (Str_Field (V, "gameStem"));
         Set_Field (O, "gameStem", Create (To_String (Stem)));
      elsif not Has_Field (V, "gameStem") or else Get (V, "gameStem").Kind = JSON_Null_Type then
         declare CS : constant String := Campaign_Stem; begin
            if CS /= "" then
               Stem := To_Unbounded_String (CS);
               Add_Change (C, "/gameStem", "derived fill", JSON_Null, Create (CS),
                           "Missing required property /gameStem: filled with campaign-derived default "
                           & CS);
               Set_Field (O, "gameStem", Create (CS));
            else
               Add_Needs (C, "/gameStem", "missing required property (no campaign context)",
                          "a caller-supplied value");
               Set_Field (O, "gameStem", JSON_Null);
            end if;
         end;
      else
         Add_Needs (C, "/gameStem", "wrong gameStem value",
                    "a value matching ^[A-Za-z0-9-]+$");
         Set_Field (O, "gameStem", Clone (Get (V, "gameStem")));
      end if;
      S := (To_Unbounded_String (To_String (Stem)), Game (To_String (Stem)));
      if S.G.Kind = JSON_Object_Type then
         G_Name := To_Unbounded_String (Str_Field (S.G, "Name"));
      end if;
      Set_Field (O, "gameName", N_Str (V, "gameName", "/gameName", To_String (G_Name), C));
      Set_Field (O, "language", N_Str (V, "language", "/language",
                                       (if S.G.Kind = JSON_Object_Type
                                        then Str_Field (S.G, "Language", "English") else ""),
                                       C));
      Set_Field (O, "revision", N_Int (V, "revision", "/revision", 1, C, Min => 1));
      Set_Field (O, "formatVersion", N_Format_Version (V, C));
      Set_Field (O, "createdAt", N_Timestamp (V, "createdAt", "/createdAt", C));
      Set_Field (O, "updatedAt", N_Timestamp (V, "updatedAt", "/updatedAt", C));
      Set_Field (O, "crewTypeName", N_Str (V, "crewTypeName", "/crewTypeName", "", C));
      Set_Field (O, "name", N_Str (V, "name", "/name", "", C));
      Set_Field (O, "lair", N_Str (V, "lair", "/lair", "", C));
      Set_Field (O, "reputation", N_Str (V, "reputation", "/reputation", "", C));
      Set_Field (O, "huntingGrounds", N_Str (V, "huntingGrounds", "/huntingGrounds", "", C));
      --  CONTRACT-04: tier clamps to [0, CrewTierMax] (D5 clamp semantics,
      --  same shape as turf).  CrewTierMax is startup-required for every
      --  supported game; when it is absent or unresolvable here the
      --  normalizer fails loudly on /tier instead of guessing a literal
      --  ceiling (no hardcoded game maxima — spec §5.5).
      declare
         Have_Max : constant Boolean :=
           S.G.Kind = JSON_Object_Type
           and then Has_Field (S.G, "CrewTierMax")
           and then Get (S.G, "CrewTierMax").Kind = JSON_Int_Type;
      begin
         if Have_Max then
            Set_Field (O, "tier", N_Int (V, "tier", "/tier", 0, C,
                                         Min => 0,
                                         Max => Integer'(Get (S.G, "CrewTierMax"))));
         else
            Add_Needs (C, "/tier",
                       "game settings do not publish a CrewTierMax integer",
                       "loaded game settings with an integer CrewTierMax");
            Set_Field (O, "tier", N_Int (V, "tier", "/tier", 0, C, Min => 0));
         end if;
      end;
      Set_Field (O, "hold", N_Enum (V, "hold", "/hold", C, "|strong|weak|",
                                    Hold_Legacy, Default => "strong"));
      Set_Field (O, "heat", N_Bounded (V, "heat", "/heat", S,
                                       "CrewTrackerMaxima.HeatMax", 9, C));
      Set_Field (O, "wanted", N_Bounded (V, "wanted", "/wanted", S,
                                         "CrewTrackerMaxima.WantedMax", 4, C));
      Set_Field (O, "rep", N_Bounded (V, "rep", "/rep", S,
                                      "CrewTrackerMaxima.RepMax", 12, C));
      Set_Field (O, "experience", N_Experience (V, "experience", "/experience", S,
                                                "XpTrackMaxima.Crew", 10, C));
      Set_Field (O, "specialAbilities",
                 N_Items (V, "specialAbilities", "", "/specialAbilities", S, C,
                          Spec_Ability_Item'Access));
      Set_Field (O, "upgrades", N_Items (V, "upgrades", "", "/upgrades", S, C,
                                         Upgrade_Item'Access));
      Set_Field (O, "cohorts", N_Items (V, "cohorts", "", "/cohorts", S, C,
                                        Cohort_Item'Access));
      Set_Field (O, "coin", N_Int (V, "coin", "/coin", 0, C, Min => 0));
      Set_Field (O, "stash", N_Int (V, "stash", "/stash", 0, C, Min => 0));
      --  CONTRACT-04: stashCapacity is write-time derived from the crew's own
      --  vault marks and validated settings — never accepted as input.  The
      --  computed value always wins over any supplied one; a missing field is
      --  a derived fill, a stale supplied value is a derived recompute.
      declare
         Computed : constant Integer := Crew_Stash_Capacity (O);
      begin
         if not Has_Field (V, "stashCapacity")
           or else Get (V, "stashCapacity").Kind = JSON_Null_Type
         then
            Add_Change (C, "/stashCapacity", "derived fill", JSON_Null,
                        Create (Computed),
                        "Missing required property /stashCapacity: filled with "
                        & "the settings/vault-derived capacity "
                        & Trim_Image (Computed)
                        & " (CONTRACT-04)");
         elsif Get (V, "stashCapacity").Kind /= JSON_Int_Type
           or else Integer'(Get (Get (V, "stashCapacity"))) /= Computed
         then
            Add_Change (C, "/stashCapacity", "derived recompute",
                        Clone (Get (V, "stashCapacity")),
                        Create (Computed),
                        "Property /stashCapacity was not the server-computed "
                        & "vault-derived capacity: recomputed to "
                        & Trim_Image (Computed) & " (CONTRACT-04)");
         end if;
         Set_Field (O, "stashCapacity", Create (Computed));
      end;
      Set_Field (O, "notes", N_Notes (V, "notes", "/notes", C));
      --  turf: L7 (pre-C4 crews lack it) + D5 clamp to [0, TurfMax]
      declare
         TMax : constant Integer :=
           (if S.G.Kind = JSON_Object_Type then Settings_Int (S, "TurfMax", 6) else 6);
         TV : JSON_Value;
      begin
         if not Has_Field (V, "turf") or else Get (V, "turf").Kind = JSON_Null_Type then
            Add_Change (C, "/turf", "legacy conversion (L7)", JSON_Null, Create (Integer'(0)),
                        "Legacy shape at /turf: converted per rule L7: missing turf filled with 0");
            TV := Create (Integer'(0));
         else
            TV := N_Int (V, "turf", "/turf", 0, C, Min => 0, Max => TMax);
         end if;
         Set_Field (O, "turf", TV);
      end;
      --  contacts/factions: L6 (C3-era crews lack them) — empty means none
      Set_Field (O, "contacts", N_Items (V, "contacts", "", "/contacts", S, C,
                                         Contact_Item'Access, L6 => True));
      Set_Field (O, "factions", N_Items (V, "factions", "", "/factions", S, C,
                                         Faction_Item'Access, L6 => True));
      Set_Field (O, "claimedClaimIds", N_Claimed_Ids (V, "/claimedClaimIds", C));
      Set_Field (O, "claimOverrides",
                 N_Items (V, "claimOverrides", "", "/claimOverrides", S, C,
                          Override_Item'Access));
      return O;
   end Canonicalize_Crew;

   --  clock size: no usable positive default (a guess would change game
   --  meaning) — the governing spec's needs-input example.
   function N_Size (O : JSON_Value; C : in out N_Ctx) return JSON_Value is
   begin
      if Has_Field (O, "size") and then Get (O, "size").Kind = JSON_Int_Type
        and then Int_Field (O, "size") >= 1
      then
         return Clone (Get (O, "size"));
      end if;
      if Has_Field (O, "size") and then Get (O, "size").Kind /= JSON_Null_Type then
         Add_Needs (C, "/size", "wrong size value (minimum 1; no derivable default)",
                    "an integer of at least 1");
         return Clone (Get (O, "size"));
      end if;
      Add_Needs (C, "/size", "missing required property (no derivable default)",
                 "a caller-supplied integer of at least 1");
      return JSON_Null;
   end N_Size;

   function N_Related_Ids (O : JSON_Value; C : in out N_Ctx) return JSON_Value is
   begin
      if not Has_Field (O, "relatedClockIds") or else Get (O, "relatedClockIds").Kind = JSON_Null_Type then
         Add_Change (C, "/relatedClockIds", "missing/null fill", JSON_Null, Create (Empty_Array),
                     "Missing required property /relatedClockIds: filled with canonical default []");
         return Create (Empty_Array);
      end if;
      declare V : constant JSON_Value := Get (O, "relatedClockIds"); begin
         if V.Kind /= JSON_Array_Type then
            Add_Needs (C, "/relatedClockIds", "wrong type: expected an array", "an array of UUIDs");
            return Clone (V);
         end if;
      end;
      declare
         A : constant JSON_Array := Get (O, "relatedClockIds");
         V : constant JSON_Value := Get (O, "relatedClockIds");
         O2 : JSON_Array := Empty_Array;
         Dropped : Boolean := False;
      begin
         for I in 1 .. Length (A) loop
            declare
               Item : constant JSON_Value := Get (A, I);
               P : constant String := "/relatedClockIds/" & Trim_Image (I - 1);
            begin
               if Item.Kind /= JSON_String_Type then
                  Add_Needs (C, P, "wrong type: expected a string", "a UUID");
                  Append (O2, Clone (Item));
               else
                  declare S : constant String := String'(Get (Item)); begin
                  if not Is_Uuid (S) then
                     Add_Needs (C, P, "wrong value: not a UUID", "a UUID");
                     Append (O2, Create (S));
                  else
                     declare Dup : Boolean := False; begin
                        for J in 1 .. Length (O2) loop
                           if String'(Get (Get (O2, J))) = S then Dup := True; exit; end if;
                        end loop;
                        if Dup then Dropped := True;
                        else Append (O2, Create (S));
                        end if;
                     end;
                  end if;
                  end;
               end if;
            end;
         end loop;
         if Dropped then
            Add_Change (C, "/relatedClockIds", "uniqueItems", Clone (V), Create (O2),
                        "Property /relatedClockIds contains duplicate items: de-duplicated");
         end if;
         return Create (O2);
      end;
   end N_Related_Ids;

   function Canonicalize_Clock
     (V : JSON_Value; Kind, Id : String; C : in out N_Ctx) return JSON_Value
   is
      O : JSON_Value := Create_Object;
      Used_Clock_Kind : Boolean := False;
      Used_Time : Boolean := False;
      Behavior_Val : Unbounded_String := Null_Unbounded_String;
      Size_N : Integer := 0;
      Size_Ok : Boolean := False;
      Exempt : Unbounded_String := Null_Unbounded_String;
   begin
      --  L5: behavior resolution happens first so the legacy-key exemption
      --  for the generic unknown-key listing can be computed.
      if not Has_Field (V, "behavior") or else Get (V, "behavior").Kind = JSON_Null_Type then
         if Has_Field (V, "clockKind") and then Get (V, "clockKind").Kind = JSON_String_Type then
            Used_Clock_Kind := True;
            if Str_Field (V, "clockKind") = "rollover" then
               Behavior_Val := To_Unbounded_String ("rollover");
            elsif Str_Field (V, "clockKind") = "project" then
               Behavior_Val := To_Unbounded_String ("bounded");
            end if;
            if Behavior_Val = "" then
               Add_Needs (C, "/behavior", "wrong clockKind value; no derivable behavior",
                          "behavior bounded or rollover");
            else
               Add_Change (C, "/clockKind", "legacy conversion (L5)",
                           Create (Str_Field (V, "clockKind")), Create (Behavior_Val),
                           "Legacy shape at /clockKind: converted per rule L5: clockKind -> behavior");
            end if;
         elsif Has_Field (V, "rollover") then
            --  presence of a rollover key (even 0) means RolloverClock (L5)
            Behavior_Val := To_Unbounded_String ("rollover");
            Add_Change (C, "/behavior", "legacy conversion (L5)", JSON_Null, Create ("rollover"),
                        "Legacy shape at /behavior: converted per rule L5: rollover presence -> behavior rollover");
         else
            Add_Needs (C, "/behavior", "missing required property (ambiguous; no derivable value)",
                       "behavior bounded or rollover");
         end if;
      elsif Get (V, "behavior").Kind = JSON_String_Type then
         if Str_Field (V, "behavior") = "bounded" or else Str_Field (V, "behavior") = "rollover" then
            Behavior_Val := To_Unbounded_String (Str_Field (V, "behavior"));
         else
            Add_Change (C, "/behavior",
                        "needs-input: enum variant " & Str_Field (V, "behavior")
                        & " not in |bounded|rollover|: requires caller-supplied value",
                        Create (Str_Field (V, "behavior")), JSON_Null,
                        "Property /behavior value '" & Str_Field (V, "behavior")
                        & "' is not in |bounded|rollover|: not a known variant; requires a caller-supplied value");
            Add_Needs (C, "/behavior",
                       "wrong enum value: " & Str_Field (V, "behavior")
                       & " is not in |bounded|rollover|: not a known variant; requires a caller-supplied value",
                       "behavior bounded or rollover");
         end if;
      else
         Add_Needs (C, "/behavior", "wrong type: expected a string", "behavior bounded or rollover");
      end if;
      if Has_Field (V, "time") and then Get (V, "time").Kind /= JSON_Null_Type then
         if not Has_Field (V, "segments") or else Get (V, "segments").Kind = JSON_Null_Type then
            Used_Time := True;
         end if;
      end if;
      Exempt := To_Unbounded_String
        ((if Used_Clock_Kind then "|clockKind|" else "")
         & (if Used_Time then "|time|" else ""));
      List_Removals (V, "", Allowed_Clock, C, To_String (Exempt));
      --  identity (Q15)
      if Has_Field (V, "kind") and then Get (V, "kind").Kind = JSON_String_Type
        and then Str_Field (V, "kind") = Kind
      then
         Set_Field (O, "kind", Kind);
      else
         Add_Change (C, "/kind", "identity normalization",
                     (if Has_Field (V, "kind") then Get (V, "kind") else JSON_Null),
                     Create (Kind),
                     "Body kind does not match route " & Kind
                     & ": normalized to route identity (directory is authoritative)");
         Set_Field (O, "kind", Kind);
      end if;
      if Has_Field (V, "id") and then Get (V, "id").Kind = JSON_String_Type
        and then Str_Field (V, "id") = Id
      then
         Set_Field (O, "id", Id);
      else
         Add_Change (C, "/id", "identity normalization",
                     (if Has_Field (V, "id") then Get (V, "id") else JSON_Null),
                     Create (Id),
                     "Body id does not match route " & Id
                     & ": normalized to route identity (directory is authoritative)");
         Set_Field (O, "id", Id);
      end if;
      Set_Field (O, "revision", N_Int (V, "revision", "/revision", 1, C, Min => 1));
      Set_Field (O, "formatVersion", N_Format_Version (V, C));
      Set_Field (O, "createdAt", N_Timestamp (V, "createdAt", "/createdAt", C));
      Set_Field (O, "updatedAt", N_Timestamp (V, "updatedAt", "/updatedAt", C));
      --  name: identifying configuration; no canonical empty (minLength 1)
      if Has_Field (V, "name") and then Get (V, "name").Kind = JSON_String_Type
        and then Str_Field (V, "name") /= ""
      then
         Set_Field (O, "name", Create (Str_Field (V, "name")));
      else
         Add_Needs (C, "/name", "missing or empty name (no canonical empty)",
                    "a non-empty string");
         Set_Field (O, "name",
                    (if Has_Field (V, "name") then Clone (Get (V, "name")) else JSON_Null));
      end if;
      Set_Field (O, "ownerKind", N_Enum (V, "ownerKind", "/ownerKind", C,
                                         "|campaign|character|crew|", No_Legacy,
                                         Default => "campaign"));
      Set_Field (O, "ownerId", N_Str (V, "ownerId", "/ownerId", "", C));
      Set_Field (O, "purpose", N_Enum (V, "purpose", "/purpose", C,
                                       "|progress|danger|racing|linked|mission|tug-of-war|long-term-project|faction|score|custom|",
                                       No_Legacy, Default => "custom"));
      if To_String (Behavior_Val) /= "" then
         Set_Field (O, "behavior", Create (To_String (Behavior_Val)));
      elsif Has_Field (V, "behavior") then
         Set_Field (O, "behavior", Clone (Get (V, "behavior")));
      else
         Set_Field (O, "behavior", JSON_Null);
      end if;
      --  size first (needed for the segments clamp)
      declare SV : constant JSON_Value := N_Size (V, C); begin
         if SV.Kind = JSON_Int_Type then
            declare N : constant Integer := Integer'(Get (SV)); begin
               if N >= 1 then Size_N := N; Size_Ok := True; end if;
            end;
         end if;
         Set_Field (O, "size", SV);
      end;
      --  segments: FILL 0; legacy "time" maps to segments (L5); then the
      --  x-segmentsLeSize clamp
      declare
         SV : JSON_Value;
      begin
         if Used_Time then
            declare N : Integer; begin
               if Get (V, "time").Kind = JSON_Int_Type then
                  N := Integer'(Get (Get (V, "time")));
                  Add_Change (C, "/time", "legacy conversion (L5)",
                              Clone (Get (V, "time")), Create (N),
                              "Legacy shape at /time: converted per rule L5: time -> segments");
                  SV := Create (N);
               elsif Get (V, "time").Kind = JSON_String_Type
                 and then Int_From_String (Str_Field (V, "time"), N)
               then
                  Add_Change (C, "/time", "legacy conversion (L5)",
                              Clone (Get (V, "time")), Create (N),
                              "Legacy shape at /time: converted per rule L5: time -> segments");
                  SV := Create (N);
               else
                  Add_Needs (C, "/segments", "wrong time value; cannot derive segments",
                             "an integer");
                  SV := (if Has_Field (V, "segments") then Clone (Get (V, "segments")) else JSON_Null);
               end if;
            end;
         else
            SV := N_Int (V, "segments", "/segments", 0, C, Min => 0);
         end if;
         if Size_Ok and then SV.Kind = JSON_Int_Type and then Integer'(Get (SV)) > Size_N then
            Add_Change (C, "/segments", "clamp", Clone (SV), Create (Size_N),
                        "Property /segments value " & Trim_Image (Integer'(Get (SV)))
                        & " exceeds size " & Trim_Image (Size_N)
                        & " (x-segmentsLeSize): clamped to " & Trim_Image (Size_N));
            SV := Create (Size_N);
         end if;
         Set_Field (O, "segments", SV);
      end;
      --  rollover: FILL 0; bounded clocks must carry 0 (schema if/then)
      declare
         RV : JSON_Value := N_Int (V, "rollover", "/rollover", 0, C, Min => 0);
      begin
         if To_String (Behavior_Val) = "bounded" and then RV.Kind = JSON_Int_Type
           and then Integer'(Get (RV)) /= 0
         then
            Add_Change (C, "/rollover", "const", Clone (RV), Create (Integer'(0)),
                        "Property /rollover must be 0 when behavior is bounded (schema if/then): set to 0");
            RV := Create (Integer'(0));
         end if;
         Set_Field (O, "rollover", RV);
      end;
      Set_Field (O, "relatedClockIds", N_Related_Ids (V, C));
      return O;
   end Canonicalize_Clock;

   function Canonicalize (Kind, Id : String; V : JSON_Value) return JSON_Value is
      C : N_Ctx;
      R : JSON_Value := Create_Object;
      Doc : JSON_Value := JSON_Null;
      Outcome : Unbounded_String := Null_Unbounded_String;
   begin
      if V.Kind /= JSON_Object_Type then
         --  D9: a non-object root is unreadable — no normalization possible
         declare Issues : JSON_Array := Empty_Array; begin
            Append (Issues, Issue_At
                      ("", "document root is not an entity object; unreadable — cannot be normalized",
                       "a parseable entity object"));
            Set_Field (R, "outcome", "unreadable");
            Set_Field (R, "canonical", False);
            Set_Field (R, "changes", Empty_Array);
            Set_Field (R, "warnings", Empty_Array);
            Set_Field (R, "needsInputPointers", Empty_Array);
            Set_Field (R, "issues", Issues);
         end;
         return R;
      end if;
      if Has_Field (V, "kind") and then Get (V, "kind").Kind = JSON_String_Type
        and then Str_Field (V, "kind") /= Kind
      then
         --  D8: a body of a wholly different entity type needs the caller's
         --  decision (repair or delete + re-import); never normalized.
         declare
            Issues : JSON_Array := Empty_Array;
            Needs  : JSON_Array := Empty_Array;
         begin
            Append (Issues, Issue_At
                      ("/kind", "identity: body kind " & Str_Field (V, "kind")
                       & " does not match route " & Kind
                       & " (directory is authoritative)",
                       "kind " & Kind));
            Append (Needs, Create ("/kind"));
            Set_Field (R, "outcome", "needs-input");
            Set_Field (R, "canonical", False);
            Set_Field (R, "document", Clone (V));
            Set_Field (R, "changes", Empty_Array);
            Set_Field (R, "warnings", Empty_Array);
            Set_Field (R, "needsInputPointers", Needs);
            Set_Field (R, "issues", Issues);
         end;
         return R;
      end if;
      if Kind = "character" then Doc := Canonicalize_Character (V, Kind, Id, C);
      elsif Kind = "crew" then Doc := Canonicalize_Crew (V, Kind, Id, C);
      else Doc := Canonicalize_Clock (V, Kind, Id, C);
      end if;
      if Length (C.Needs) > 0 then Outcome := To_Unbounded_String ("needs-input");
      elsif Length (C.Changes) > 0 then Outcome := To_Unbounded_String ("repairable");
      else Outcome := To_Unbounded_String ("canonical");
      end if;
      Set_Field (R, "outcome", To_String (Outcome));
      Set_Field (R, "canonical", To_String (Outcome) = "canonical");
      Set_Field (R, "document", Doc);
      Set_Field (R, "changes", C.Changes);
      Set_Field (R, "warnings", C.Warnings);
      Set_Field (R, "needsInputPointers", C.Needs);
      Set_Field (R, "issues", C.Issues);
      return R;
   end Canonicalize;

   function Canonicalize (Kind, Id : String; Bytes : String) return JSON_Value is
   begin
      return Canonicalize (Kind, Id, Read (Bytes));
   exception
      when others =>
         --  D10: unparseable bytes (invalid UTF-8, truncation, trailing
         --  garbage) are unreadable — deletion only.
         declare
            R : JSON_Value := Create_Object;
            Issues : JSON_Array := Empty_Array;
         begin
            Append (Issues, Issue_At
                      ("", "bytes cannot be parsed as JSON; unreadable — cannot be normalized",
                       "a parseable entity object"));
            Set_Field (R, "outcome", "unreadable");
            Set_Field (R, "canonical", False);
            Set_Field (R, "changes", Empty_Array);
            Set_Field (R, "warnings", Empty_Array);
            Set_Field (R, "needsInputPointers", Empty_Array);
            Set_Field (R, "issues", Issues);
            return R;
         end;
   end Canonicalize;

   ---------------------------------------------------------------------------
   --  SC-A2 import/repair transaction helpers.
   ---------------------------------------------------------------------------

   --  sha256:<lowercase hex> content token of raw bytes (frozen
   --  errorContentToken pattern); also the delete/repair If-Match value for
   --  degraded entities.

   --  RFC 6901 pointer walking: split "/a/b/0" into segments (array indices
   --  are 0-based per the pointer spec).
   Max_Pointer_Segments : constant := 32;
   type Seg_List is array (1 .. Max_Pointer_Segments) of Unbounded_String;

   procedure Split_Pointer (Pointer : String; Segs : out Seg_List; N : out Natural) is
      P : Natural := Pointer'First;
   begin
      N := 0;
      while P <= Pointer'Last loop
         declare
            E : Natural := P;
         begin
            while E <= Pointer'Last and then Pointer (E) /= '/' loop
               E := E + 1;
            end loop;
            if E > P and then N < Max_Pointer_Segments then
               N := N + 1;
               Segs (N) := To_Unbounded_String (Pointer (P .. E - 1));
            end if;
            P := E + 1;
         end;
      end loop;
   end Split_Pointer;

   function Get_At_Pointer (Doc : JSON_Value; Pointer : String) return JSON_Value is
      Segs : Seg_List;
      N    : Natural;
      Cur  : JSON_Value := Doc;
   begin
      Split_Pointer (Pointer, Segs, N);
      for I in 1 .. N loop
         declare
            S   : constant String := To_String (Segs (I));
            Idx : Integer;
         begin
            if Cur.Kind = JSON_Object_Type and then Has_Field (Cur, S) then
               Cur := Get (Cur, S);
            elsif Cur.Kind = JSON_Array_Type and then Int_From_String (S, Idx) then
               if Idx >= 0 and then Idx < Length (JSON_Array'(Get (Cur))) then
                  Cur := Get (JSON_Array'(Get (Cur)), Idx + 1);
               else
                  return JSON_Null;
               end if;
            else
               return JSON_Null;
            end if;
         end;
      end loop;
      return Cur;
   end Get_At_Pointer;

   function Int_At_Pointer (Doc : JSON_Value; Pointer : String) return Integer is
      V : constant JSON_Value := Get_At_Pointer (Doc, Pointer);
   begin
      if V.Kind = JSON_Int_Type then return Integer'(Get (V)); end if;
      return Integer'First; --  absent or non-integer: not checked
   end Int_At_Pointer;

   --  Set Value at Pointer inside Doc (object keys; array indices resolve
   --  only as intermediate steps).  Returns False when the path cannot be
   --  resolved or the final segment is an array index.
   function Set_At_Pointer
     (Doc : JSON_Value; Pointer : String; Value : JSON_Value) return Boolean
   is
      Segs : Seg_List;
      N    : Natural;
      Cur  : JSON_Value := Doc;
   begin
      Split_Pointer (Pointer, Segs, N);
      if N = 0 then return False; end if;
      for I in 1 .. N - 1 loop
         declare
            S   : constant String := To_String (Segs (I));
            Idx : Integer;
         begin
            if Cur.Kind = JSON_Object_Type and then Has_Field (Cur, S) then
               Cur := Get (Cur, S);
            elsif Cur.Kind = JSON_Array_Type and then Int_From_String (S, Idx) then
               if Idx >= 0 and then Idx < Length (JSON_Array'(Get (Cur))) then
                  Cur := Get (JSON_Array'(Get (Cur)), Idx + 1);
               else
                  return False;
               end if;
            else
               return False;
            end if;
         end;
      end loop;
      if Cur.Kind = JSON_Object_Type then
         Set_Field (Cur, To_String (Segs (N)), Value);
         return True;
      end if;
      return False;
   end Set_At_Pointer;

   --  Import preview: server-derivable needs-input pointers are resolved
   --  into previewed fills (R0 matrix §3: gameStem from the stored entity or
   --  the owning campaign — resolved FIRST so every settings-derived fill
   --  (DERIVED rows) computes; createdAt from the stored entity, else server
   --  'now'; updatedAt server 'now').  Each resolution becomes a change
   --  entry and warning; pointers that remain are caller-only needs-input.
   --  Mutates the canonicalize result R in place (re-running the canonicalizer
   --  when the gameStem becomes resolvable).
   procedure Resolve_Import_Needs
     (Kind, Id : String; Stored, Entity_V : JSON_Value; R : in out JSON_Value)
   is
      Doc      : JSON_Value;
      Needs    : JSON_Array;
      All_Issues : JSON_Array;
      Changes  : JSON_Array := Empty_Array;
      Warnings : JSON_Array := Empty_Array;
      Remaining : JSON_Array := Empty_Array;
      Issues   : JSON_Array := Empty_Array;
      Stem     : Unbounded_String := Null_Unbounded_String;
      Created  : Unbounded_String := Null_Unbounded_String;
   begin
      if Stored.Kind = JSON_Object_Type then
         Stem := To_Unbounded_String (Str_Field (Stored, "gameStem"));
         Created := To_Unbounded_String (Str_Field (Stored, "createdAt"));
      end if;
      if Length (Stem) = 0 then Stem := To_Unbounded_String (Campaign_Stem); end if;
      if Length (Created) = 0 then Created := To_Unbounded_String (Now); end if;
      if Length (Stem) > 0 and then
        (not Has_Field (Entity_V, "gameStem")
         or else Get (Entity_V, "gameStem").Kind = JSON_Null_Type)
      then
         Set_Field (Entity_V, "gameStem", To_String (Stem));
         declare
            X : JSON_Value := Create_Object;
         begin
            Set_Field (X, "pointer", "/gameStem");
            Set_Field (X, "reason", "derived fill (import context)");
            Set_Field (X, "previous", JSON_Null);
            Set_Field (X, "replacement", Create (To_String (Stem)));
            Append (Changes, X);
         end;
         Append (Warnings, Create
                   ("Missing required property /gameStem: filled with the campaign-derived default "
                    & To_String (Stem)));
         R := Canonicalize (Kind, Id, Entity_V);
      end if;
      Doc := Get (R, "document");
      Needs := Get (R, "needsInputPointers");
      All_Issues := Get (R, "issues");
      declare
         Run_Changes : constant JSON_Array := Get (Get (R, "changes"));
         Run_Warnings : constant JSON_Array := Get (Get (R, "warnings"));
      begin
         for I in 1 .. Length (Run_Changes) loop
            Append (Changes, Get (Run_Changes, I));
         end loop;
         for I in 1 .. Length (Run_Warnings) loop
            Append (Warnings, Get (Run_Warnings, I));
         end loop;
      end;
      for I in 1 .. Length (Needs) loop
         declare
            Ptr      : constant String := Get (Get (Needs, I));
            V        : JSON_Value := JSON_Null;
            Resolved : Boolean := False;
         begin
            if Ptr = "/createdAt" and then Length (Created) > 0 then
               V := Create (To_String (Created));
               Resolved := True;
            elsif Ptr = "/updatedAt" then
               V := Create (Now);
               Resolved := True;
            end if;
            if Resolved then
               Set_Field (Doc, Ptr (Ptr'First + 1 .. Ptr'Last), V);
               declare
                  X : JSON_Value := Create_Object;
               begin
                  Set_Field (X, "pointer", Ptr);
                  Set_Field (X, "reason", "server-stamped fill (import)");
                  Set_Field (X, "previous", JSON_Null);
                  Set_Field (X, "replacement", Clone (V));
                  Append (Changes, X);
               end;
               Append (Warnings, Create
                         ("Missing required property " & Ptr
                          & ": filled with a server-stamped value on apply"));
            else
               Append (Remaining, Create (Ptr));
            end if;
         end;
      end loop;
      for I in 1 .. Length (All_Issues) loop
         declare
            X : constant JSON_Value := Get (All_Issues, I);
            Keep : Boolean := False;
         begin
            for J in 1 .. Length (Remaining) loop
               declare
                  R_Ptr : constant String := Get (Get (Remaining, J));
               begin
                  if R_Ptr = Str_Field (X, "pointer") then
                     Keep := True;
                     exit;
                  end if;
               end;
            end loop;
            if Keep then Append (Issues, X); end if;
         end;
      end loop;
      Set_Field (R, "needsInputPointers", Remaining);
      Set_Field (R, "issues", Issues);
      Set_Field (R, "changes", Changes);
      Set_Field (R, "warnings", Warnings);
      Set_Field (R, "outcome",
                 (if Length (Remaining) > 0 then "needs-input"
                  elsif Length (Changes) > 0 then "repairable"
                  else "canonical"));
      Set_Field (R, "canonical",
                 Length (Remaining) = 0 and then Length (Changes) = 0);
   end Resolve_Import_Needs;

   --  Import apply gate (R4 gap #4, LIMIT-IMPORT-014): the submitted
   --  document is schema-valid, but settings-derived maxima (R0 matrix
   --  DERIVED rows) must never be exceeded by an import.  Every derived
   --  pointer present in the document is compared against the game-settings
   --  bound; a value above the bound becomes an INVALID_ENTRY issue and the
   --  apply is refused with nothing written.  Unresolvable settings (no
   --  gameStem / missing game file) skip the gate.
   function Settings_Maxima_Issues (Kind : String; Doc : JSON_Value) return JSON_Array is
      Out_A : JSON_Array := Empty_Array;
      Stem  : constant String := Str_Field (Doc, "gameStem");
      G     : constant JSON_Value := Game (Stem);
      S     : constant Settings_Ref := (To_Unbounded_String (Stem), G);

      procedure Check (Ptr, Key : String) is
         Bound : constant Integer := Settings_Int (S, Key, Integer'Last);
         Val   : constant Integer := Int_At_Pointer (Doc, Ptr);
      begin
         if Val /= Integer'First and then Bound /= Integer'Last
           and then Val > Bound
         then
            declare
               X : JSON_Value := Create_Object;
            begin
               Set_Field (X, "pointer", Ptr);
               Set_Field (X, "reason",
                          "value " & Trim_Image (Val)
                          & " exceeds the settings-derived maximum " & Trim_Image (Bound));
               Set_Field (X, "expected",
                          "an integer in [0, " & Trim_Image (Bound) & "]");
               Append (Out_A, X);
            end;
         end if;
      end Check;
   begin
      if G.Kind /= JSON_Object_Type then return Out_A; end if;
      if Kind = "character" then
         Check ("/monitor/stress/max", "StressMax");
         Check ("/monitor/trauma/max", "TraumaMax");
         Check ("/monitor/harm/healingClock/size", "RecoveryClockSize");
         Check ("/fund/satchel/max", "FundMaxima.SatchelMax");
         Check ("/fund/stash/max", "FundMaxima.StashMax");
         Check ("/playbook/experience/max", "XpTrackMaxima.Playbook");
         Check ("/session/max", "SessionExpressionMax");
         Check ("/gear/maxBulk", "LoadMaxima.MaxBulk");
         --  array items: attributes[].experience.max and actions[].maxRating
         declare
            Attrs : constant JSON_Value := Get_At_Pointer (Doc, "/talent/attributes");
         begin
            if Attrs.Kind = JSON_Array_Type then
               declare
                  Attr_Arr : constant JSON_Array := Get (Attrs);
               begin
                  for I in 1 .. Length (Attr_Arr) loop
                     declare
                        Item : constant JSON_Value := Get (Attr_Arr, I);
                     begin
                        if Item.Kind = JSON_Object_Type then
                           Check ("/talent/attributes/" & Trim_Image (I - 1)
                                  & "/experience/max", "XpTrackMaxima.Attribute");
                           if Has_Field (Item, "actions") then
                              declare
                                 Acts : constant JSON_Value := Get (Item, "actions");
                              begin
                                 if Acts.Kind = JSON_Array_Type then
                                    declare
                                       Act_Arr : constant JSON_Array := Get (Acts);
                                    begin
                                       for J in 1 .. Length (Act_Arr) loop
                                          Check ("/talent/attributes/" & Trim_Image (I - 1)
                                                 & "/actions/" & Trim_Image (J - 1)
                                                 & "/maxRating", "ActionPointMaximum");
                                       end loop;
                                    end;
                                 end if;
                              end;
                           end if;
                        end if;
                     end;
                  end loop;
               end;
            end if;
         end;
      else
         Check ("/experience/max", "XpTrackMaxima.Crew");
         Check ("/heat/max", "CrewTrackerMaxima.HeatMax");
         Check ("/wanted/max", "CrewTrackerMaxima.WantedMax");
         Check ("/rep/max", "CrewTrackerMaxima.RepMax");
         Check ("/turf", "TurfMax");
         --  CONTRACT-04: the crew tier ceiling is settings-derived too.
         Check ("/tier", "CrewTierMax");
      end if;
      return Out_A;
   end Settings_Maxima_Issues;

   --  True when any change entry in Changes has the given reason prefix
   --  (used to detect classified unknown-key removals).
   function Has_Change_Reason (Changes : JSON_Array; Reason : String) return Boolean is
   begin
      for I in 1 .. Length (Changes) loop
         declare
            X : constant JSON_Value := Get (Changes, I);
         begin
            if Str_Field (X, "reason") = Reason then return True; end if;
         end;
      end loop;
      return False;
   end Has_Change_Reason;

   --  Issue triples for every change entry with the given reason (unknown-key
   --  removals), for the frozen INVALID_ENTRY details.
   function Issues_For_Reason (Changes : JSON_Array; Reason : String) return JSON_Array is
      Out_A : JSON_Array := Empty_Array;
   begin
      for I in 1 .. Length (Changes) loop
         declare
            X : constant JSON_Value := Get (Changes, I);
         begin
            if Str_Field (X, "reason") = Reason then
               Append (Out_A, Issue_At (Str_Field (X, "pointer"),
                                        "unknown property; removal was not classified by a preview",
                                        "remove the property or preview its classified removal"));
            end if;
         end;
      end loop;
      return Out_A;
   end Issues_For_Reason;

   --  True when B contains only the pipe-wrapped allowed field names.
   function Only_Fields (B : JSON_Value; Allowed : String) return Boolean is
      K : constant JSON_Array := Collect_Keys (B);
   begin
      if B.Kind /= JSON_Object_Type then return False; end if;
      for I in 1 .. Length (K) loop
         if not In_Allowed (Get (Get (K, I)), Allowed) then return False; end if;
      end loop;
      return True;
   end Only_Fields;


   procedure Preview_Issue
     (Kind, Id, Input_Hash : String; Revision : Integer; Content : String;
      Doc : JSON_Value; Outcome : String;
      Needs, Issues, Changes, Warnings : JSON_Array;
      Token : out Unbounded_String)
   is
   begin
      Preview_Token_Store.Issue
        (Kind, Id, Input_Hash, Revision, Content, Doc, Outcome,
         Needs, Issues, Changes, Warnings, Token);
   end Preview_Issue;

   procedure Preview_Redeem
     (Token : String; Found, Used : out Boolean; E : out Preview_Token_Entry)
   is
   begin
      Preview_Token_Store.Redeem (Token, Found, Used, E);
   end Preview_Redeem;

end Pitd_Normalize;
