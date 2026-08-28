with Ada.Strings.Fixed;
with GNATCOLL.JSON;
with Pitd_Normalize;
with Pitd_Common;
with Pitd_Error;
with Pitd_Schema_Validators;

package body Pitd_Stored is
   pragma SPARK_Mode (Off);

   use GNATCOLL.JSON;
   use Pitd_Common;
   use Pitd_Error;

   function Expected_For (Reason : String) return String is
   begin
      if Ada.Strings.Fixed.Index (Reason, "missing required property") > 0 then
         return "the property must be present with a schema-valid value";
      elsif Ada.Strings.Fixed.Index (Reason, "unknown property") > 0 then
         return "only properties declared in the schema";
      elsif Ada.Strings.Fixed.Index (Reason, "pattern:") > 0 then
         return "a value matching the declared pattern";
      elsif Ada.Strings.Fixed.Index (Reason, "range:") > 0 then
         return "a value within the declared bounds";
      elsif Ada.Strings.Fixed.Index (Reason, "enum:") > 0 then
         return "one of the declared enum values";
      elsif Ada.Strings.Fixed.Index (Reason, "minLength:") > 0 then
         return "a string of at least the declared length";
      elsif Ada.Strings.Fixed.Index (Reason, "const:") > 0 then
         return "the declared constant";
      elsif Ada.Strings.Fixed.Index (Reason, "uniqueItems:") > 0 then
         return "no duplicate items";
      elsif Ada.Strings.Fixed.Index (Reason, "x-segmentsLeSize:") > 0 then
         return "segments not exceeding size";
      end if;
      return "a schema-valid value";
   end Expected_For;

   protected Validator_Gate is
      --  Validate V; Ok is True when the document is schema-valid.
      procedure Check (Kind : String; V : JSON_Value; Ok : out Boolean);
      --  Validate V and collect the pointer-level schema issues
      --  (frozen errorIssue shape); atomically captured with the run.
      procedure Collect (Kind : String; V : JSON_Value; Issues : out JSON_Array);
   private
      procedure Dispatch (Kind : String; V : JSON_Value);
   end Validator_Gate;

   protected body Validator_Gate is
      procedure Dispatch (Kind : String; V : JSON_Value) is
      begin
         Pitd_Schema_Validators.Reset;
         if Kind = "character" then
            Pitd_Schema_Validators.Validate_Character (V);
         elsif Kind = "crew" then
            Pitd_Schema_Validators.Validate_Crew (V);
         elsif Kind = "clock" then
            Pitd_Schema_Validators.Validate_Clock (V);
         end if;
      end Dispatch;

      procedure Check (Kind : String; V : JSON_Value; Ok : out Boolean) is
      begin
         Dispatch (Kind, V);
         Ok := Pitd_Schema_Validators.Valid;
      end Check;

      procedure Collect (Kind : String; V : JSON_Value; Issues : out JSON_Array) is
      begin
         Dispatch (Kind, V);
         Issues := Empty_Array;
         for I in 1 .. Pitd_Schema_Validators.N_Errors loop
            declare X : JSON_Value := Create_Object; begin
               Set_Field (X, "pointer", Pitd_Schema_Validators.Pointer (I));
               Set_Field (X, "reason", Pitd_Schema_Validators.Reason (I));
               Set_Field (X, "expected", Expected_For (Pitd_Schema_Validators.Reason (I)));
               Append (Issues, X);
            end;
         end loop;
      end Collect;
   end Validator_Gate;

   --  True when the document validates against the generated schema
   --  validator AND matches the route identity (Q15: the route is
   --  authoritative; a stored body whose kind/id contradicts its directory
   --  location is a D8 identity defect, never silently accepted).
   function Entity_Is_Canonical (Kind, Id : String; V : JSON_Value) return Boolean is
      Ok : Boolean;
   begin
      if V.Kind /= JSON_Object_Type then return False; end if;
      if Str_Field (V, "kind") /= Kind or else Str_Field (V, "id") /= Id then
         return False;
      end if;
      Validator_Gate.Check (Kind, V, Ok);
      return Ok;
   end Entity_Is_Canonical;

   --  Pointer-level admission issues (frozen errorIssue shape) for the
   --  current validator error set; identity defects are prepended when the
   --  body contradicts the route.
   function Validation_Issues (Kind, Id : String; V : JSON_Value) return JSON_Array is
      Out_A : JSON_Array := Empty_Array;
   begin
      if V.Kind = JSON_Object_Type then
         if Str_Field (V, "kind") /= Kind then
            declare
               X : JSON_Value := Create_Object;
            begin
               Set_Field (X, "pointer", "/kind");
               Set_Field (X, "reason",
                          "identity: body kind " & Str_Field (V, "kind")
                          & " does not match route " & Kind
                          & " (directory is authoritative)");
               Set_Field (X, "expected", "kind " & Kind);
               Append (Out_A, X);
            end;
         end if;
         if Str_Field (V, "id") /= Id then
            declare
               X : JSON_Value := Create_Object;
            begin
               Set_Field (X, "pointer", "/id");
               Set_Field (X, "reason",
                          "identity: body id does not match route "
                          & Id & " (directory is authoritative)");
               Set_Field (X, "expected", "id " & Id);
               Append (Out_A, X);
            end;
         end if;
      end if;
      Validator_Gate.Collect (Kind, V, Out_A);
      return Out_A;
   end Validation_Issues;

   --  SC-A3: pointer-level admission issues for a non-canonical stored
   --  document: the normalizer's needs-input issues first, then one issue
   --  per change-list entry whose pointer is not already reported (the
   --  change's replacement, rendered compactly, is the "expected" value).
   --  When the normalizer considers the document canonical but the
   --  generated validator rejects it, the validator's pointer-level issues
   --  are reported instead.
   function Admission_Issues
     (Kind, Id : String; E : JSON_Value; Ctx : JSON_Value) return JSON_Array
   is
      Out_A : JSON_Array := Empty_Array;
      Iss   : constant JSON_Array := Get (Ctx, "issues");
      Ch    : constant JSON_Array := Get (Ctx, "changes");
   begin
      for I in 1 .. Length (Iss) loop
         Append (Out_A, Get (Iss, I));
      end loop;
      for I in 1 .. Length (Ch) loop
         declare
            X   : constant JSON_Value := Get (Ch, I);
            Ptr : constant String := Str_Field (X, "pointer");
            Dup : Boolean := False;
         begin
            for J in 1 .. Length (Out_A) loop
               if Str_Field (Get (Out_A, J), "pointer") = Ptr then
                  Dup := True; exit;
               end if;
            end loop;
            if not Dup then
               Append (Out_A, Issue_At
                         (Ptr, Str_Field (X, "reason"),
                          String'(Write (Get (X, "replacement"), Compact => True))));
            end if;
         end;
      end loop;
      if Length (Out_A) = 0 then
         Out_A := Validation_Issues (Kind, Id, E);
      end if;
      return Out_A;
   end Admission_Issues;

   --  SC-A3: the ONE stored-entity classification path (R0 matrix — the
   --  four normalizer outcomes: canonical / repairable / needs-input /
   --  unreadable).  Direct GET, history reads, mutations, batch,
   --  capabilities, and collection projection all share this function.
   --  E is the raw parsed entity (JSON_Null for unreadable), Ctx the
   --  normalizer context, Issues the pointer-level admission details, and
   --  Canonical whether the stored bytes admit without repair.  Purely
   --  read-only: never writes, never repairs.
   procedure Classify_Stored
     (Kind, Id : String; Bytes : String;
      E : out JSON_Value; Ctx : out JSON_Value;
      Issues : out JSON_Array; Canonical : out Boolean)
   is
   begin
      E := JSON_Null;
      Ctx := Pitd_Normalize.Canonicalize (Kind, Id, Bytes);
      if Str_Field (Ctx, "outcome") = "unreadable" then
         Issues := Get (Ctx, "issues");
         Canonical := False;
         return;
      end if;
      begin
         E := Read (Bytes);
      exception
         when others =>
            Issues := Get (Ctx, "issues");
            Canonical := False;
            return;
      end;
      --  canonical per the normalizer AND the generated validator (the
      --  validator catches what the normalizer leaves to the schema, e.g.
      --  settings-bound violations the canonicalizer does not rewrite).
      Canonical := Bool_Field (Ctx, "canonical")
        and then Entity_Is_Canonical (Kind, Id, E);
      if Canonical then
         Issues := Empty_Array;
      else
         Issues := Admission_Issues (Kind, Id, E, Ctx);
      end if;
   end Classify_Stored;

   --  Single schema-validation entry for write paths.
   procedure Schema_Check (Kind : String; V : JSON_Value; Ok : out Boolean) is
   begin
      Validator_Gate.Check (Kind, V, Ok);
   end Schema_Check;

end Pitd_Stored;
