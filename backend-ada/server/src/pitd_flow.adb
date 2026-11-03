with Ada.Containers.Indefinite_Ordered_Sets;
with Ada.Directories;
with Ada.Strings.Fixed;
with Ada.Strings.Unbounded;
with GNAT.SHA256;
with Pitd_Common;
with Pitd_Error;
with Pitd_Ops;
with Pitd_Transactions;

package body Pitd_Flow is
   use Ada.Strings.Unbounded;
   use Pitd_Common;
   use Pitd_Error;
   package Names is new Ada.Containers.Indefinite_Ordered_Sets (String);
   Flow_Data : JSON_Value := JSON_Null;
   Completion_Op : constant String := "flow.step.complete";

   procedure Load_Guidance is
   begin
      Flow_Data := JSON_Null;
      if not Ada.Directories.Exists (To_String (Games_Root) & "/flow-guidance.json") then return; end if;
      Flow_Data := Read (Read_File (To_String (Games_Root) & "/flow-guidance.json"));
      if Flow_Data.Kind /= JSON_Object_Type
        or else not Has_Field (Flow_Data, "scoreStart")
        or else not Has_Field (Flow_Data, "resolution")
        or else Get (Flow_Data, "scoreStart").Kind /= JSON_Object_Type
        or else Get (Flow_Data, "resolution").Kind /= JSON_Object_Type
        or else not Has_Field (Get (Flow_Data, "scoreStart"), "steps")
        or else not Has_Field (Get (Flow_Data, "resolution"), "steps")
      then raise Program_Error with "invalid shared flow guidance"; end if;
   end Load_Guidance;

   function Guidance return JSON_Value is
   begin
      if Flow_Data.Kind /= JSON_Object_Type then
         raise Program_Error with "flow-guidance.json is not configured in the games directory";
      end if;
      return Flow_Data;
   end Guidance;

   function Instance_Id (Character : JSON_Value) return String is
     (Current_Flow_Instance (Character));

   function Steps (Kind : String) return JSON_Array is
   begin
      if Kind = "none" then return Empty_Array; end if;
      return Get (Get (Flow_Data, (if Kind = "score-start" then "scoreStart" else "resolution")), "steps");
   end Steps;

   function Destination (Kind, Step : String; Offset : Integer) return JSON_Value is
      A : constant JSON_Array := Steps (Kind);
   begin
      for I in 1 .. Length (A) loop
         if Str_Field (Get (A, I), "step") = Step then
            if Integer (I) + Offset in 1 .. Integer (Length (A)) then
               return Create (Str_Field (Get (A, Positive (Integer (I) + Offset)), "step"));
            end if;
            return JSON_Null;
         end if;
      end loop;
      return JSON_Null;
   end Destination;

   function Crew_Version (Crew : JSON_Value) return JSON_Value is
      V : constant JSON_Value := Create_Object;
   begin
      if Crew.Kind /= JSON_Object_Type then return JSON_Null; end if;
      Set_Field (V, "id", Str_Field (Crew, "id"));
      Set_Field (V, "revision", Int_Field (Crew, "revision"));
      return V;
   end Crew_Version;

   function Typed (Name : String) return JSON_Value is
      S : constant JSON_Value := Create_Object;
   begin Set_Field (S, "type", Name); return S; end Typed;

   function Fixed (Value : JSON_Value) return JSON_Value is
      S : constant JSON_Value := Create_Object;
   begin Set_Field (S, "const", Value); return S; end Fixed;

   function String_Schema (Nonempty : Boolean := False) return JSON_Value is
      S : constant JSON_Value := Typed ("string");
   begin if Nonempty then Set_Field (S, "minLength", Integer'(1)); end if; return S; end String_Schema;

   function Integer_Schema (Low, High : Integer) return JSON_Value is
      S : constant JSON_Value := Typed ("integer");
   begin Set_Field (S, "minimum", Low); Set_Field (S, "maximum", High); return S; end Integer_Schema;

   function Object_Schema (Properties : JSON_Value; Required : JSON_Array := Empty_Array) return JSON_Value is
      S : constant JSON_Value := Typed ("object");
   begin
      Set_Field (S, "properties", Properties);
      Set_Field (S, "required", Required);
      Set_Field (S, "additionalProperties", False);
      return S;
   end Object_Schema;

   function One_Required (Name : String) return JSON_Array is
      A : JSON_Array := Empty_Array;
   begin Append (A, Create (Name)); return A; end One_Required;

   function Payload_Hash (Value : JSON_Value) return String is
      function Canonical (V : JSON_Value) return JSON_Value is
         Result : JSON_Value;
         Keys : Names.Set;
         procedure Key (Name : UTF8_String; Item : JSON_Value) is
            pragma Unreferenced (Item);
         begin Keys.Include (String (Name)); end Key;
      begin
         if V.Kind = JSON_Object_Type then
            Result := Create_Object;
            Map_JSON_Object (V, Key'Access);
            for Name of Keys loop Set_Field (Result, Name, Canonical (Get (V, Name))); end loop;
         elsif V.Kind = JSON_Array_Type then
            declare A : constant JSON_Array := Get (V); B : JSON_Array := Empty_Array; begin
               for I in 1 .. Length (A) loop Append (B, Canonical (Get (A, I))); end loop;
               Result := Create (B);
            end;
         else Result := V; end if;
         return Result;
      end Canonical;
   begin return GNAT.SHA256.Digest (Write (Canonical (Value), Compact => True)); end Payload_Hash;

   function Only_Fields (V : JSON_Value; Allowed : String) return Boolean is
      Ok : Boolean := V.Kind = JSON_Object_Type;
      procedure Check (Name : UTF8_String; Item : JSON_Value) is
         pragma Unreferenced (Item);
      begin
         if Ada.Strings.Fixed.Index (Allowed, "|" & String (Name) & "|") = 0 then Ok := False; end if;
      end Check;
   begin
      if Ok then Map_JSON_Object (V, Check'Access); end if;
      return Ok;
   end Only_Fields;

   function Validate_Request
     (Body_Value : JSON_Value; Bad : out Unbounded_String) return Boolean is
      B : JSON_Value renames Body_Value;
      Inputs : JSON_Value;
      Ok : Boolean := True;
      procedure Check_Input (Name : UTF8_String; Value : JSON_Value) is
         N : constant String := String (Name);
      begin
         if N = "planApproach" or else N = "commitment" or else N = "note" then
            Ok := Ok and then Value.Kind = JSON_String_Type;
         elsif N = "items" then
            if Value.Kind /= JSON_Array_Type then Ok := False; return; end if;
            declare A : constant JSON_Array := Get (Value); Seen : Names.Set; begin
               for I in 1 .. Length (A) loop
                  if Get (A, I).Kind /= JSON_String_Type then Ok := False; return; end if;
                  declare Item : constant String := Get (Get (A, I)); begin
                     if Seen.Contains (Item) then Ok := False; return; end if;
                     Seen.Include (Item);
                  end;
               end loop;
            end;
         elsif N = "allocations" then
            if Value.Kind /= JSON_Object_Type then Ok := False; return; end if;
            declare
               procedure Check_Allocation (Name : UTF8_String; Amount : JSON_Value) is
                  pragma Unreferenced (Name);
               begin
                  if Amount.Kind /= JSON_Int_Type then Ok := False;
                  elsif Integer'(Get (Amount)) < 0 then Ok := False;
                  end if;
               end Check_Allocation;
            begin Map_JSON_Object (Value, Check_Allocation'Access); end;
         else
            if Value.Kind /= JSON_Int_Type then Ok := False; return; end if;
            declare Number : constant Integer := Get (Value); begin
               if (N = "total" or else N = "crewRevision") and then Number < 0 then Ok := False; end if;
               --  Existing signed domain deltas use Natural(-delta).
               if Number = Integer'First then Ok := False; end if;
            end;
         end if;
      end Check_Input;
   begin
      Bad := To_Unbounded_String ("invalid flow completion request");
      if not Only_Fields (B, "|completionId|instanceId|kind|step|skip|inputs|") then return False; end if;
      if not Has_Field (B, "completionId") or else Get (B, "completionId").Kind /= JSON_String_Type
        or else Str_Field (B, "completionId") = ""
        or else not Has_Field (B, "instanceId") or else Get (B, "instanceId").Kind /= JSON_String_Type
        or else Str_Field (B, "instanceId") = ""
        or else not Has_Field (B, "kind") or else Get (B, "kind").Kind /= JSON_String_Type
        or else not Has_Field (B, "step") or else Get (B, "step").Kind /= JSON_String_Type
        or else not Has_Field (B, "inputs") or else Get (B, "inputs").Kind /= JSON_Object_Type
        or else (Has_Field (B, "skip") and then Get (B, "skip").Kind /= JSON_Boolean_Type)
      then return False; end if;
      Inputs := Get (B, "inputs");
      if not Only_Fields (Inputs,
        "|planApproach|commitment|items|note|total|allocations|crewRevision|crewCoin|crewRep|myShare|crewHeat|crewXp|")
      then return False; end if;
      Map_JSON_Object (Inputs, Check_Input'Access);
      if not Ok then return False; end if;
      declare
         Kind : constant String := Str_Field (B, "kind");
         Step : constant String := Str_Field (B, "step");
         Found : Boolean := False;
         A : constant JSON_Array := Steps (Kind);
      begin
         if Kind /= "score-start" and then Kind /= "resolution" then return False; end if;
         for I in 1 .. Length (A) loop
            if Str_Field (Get (A, I), "step") = Step then Found := True; end if;
         end loop;
         if not Found then return False; end if;
      end;
      return True;
   exception
      when Constraint_Error => Bad := To_Unbounded_String ("completion integer is out of range"); return False;
   end Validate_Request;

   function Touches_Crew (Body_Value : JSON_Value) return Boolean is
      Inputs : constant JSON_Value := Obj_Field (Body_Value, "inputs");
   begin
      return not Bool_Field (Body_Value, "skip")
        and then (Int_Field (Inputs, "crewCoin") /= 0 or else Int_Field (Inputs, "crewRep") /= 0
          or else Int_Field (Inputs, "crewHeat") /= 0 or else Int_Field (Inputs, "crewXp") /= 0);
   end Touches_Crew;

   function Input_Schema (Character, Crew : JSON_Value; Kind, Step : String) return JSON_Value is
      P : constant JSON_Value := Create_Object;
      Required : JSON_Array := Empty_Array;
      Rules : JSON_Array := Empty_Array;
      function Track (Name : String) return JSON_Value is
         T : constant JSON_Value := Get (Crew, Name);
         Field : constant String := (if Name = "experience" then "points" else "current");
      begin return Integer_Schema (-Int_Field (T, Field), Int_Field (T, "max") - Int_Field (T, Field)); end Track;
      procedure Crew_Delta (Name, Track_Name : String) is
         Rule, Condition, Condition_Props, Nonzero, Consequence : JSON_Value;
      begin
         if Crew.Kind /= JSON_Object_Type then
            Set_Field (P, Name, Fixed (Create (Integer'(0))));
            return;
         end if;
         Set_Field (P, Name, (if Track_Name = "coin" then Integer_Schema (-Int_Field (Crew, "coin"), Integer'Last - Int_Field (Crew, "coin")) else Track (Track_Name)));
         Condition_Props := Create_Object;
         Nonzero := Create_Object;
         Set_Field (Nonzero, "not", Fixed (Create (Integer'(0))));
         Set_Field (Condition_Props, Name, Nonzero);
         Condition := Typed ("object");
         Set_Field (Condition, "properties", Condition_Props);
         Set_Field (Condition, "required", One_Required (Name));
         Consequence := Create_Object;
         Set_Field (Consequence, "required", One_Required ("crewRevision"));
         Rule := Create_Object;
         Set_Field (Rule, "if", Condition);
         Set_Field (Rule, "then", Consequence);
         Append (Rules, Rule);
      end Crew_Delta;
   begin
      if Step = "planning" then
         declare S : constant JSON_Value := String_Schema; Values : JSON_Array := Empty_Array;
            Approaches : constant JSON_Array := Get (Get (Get (Flow_Data, "scoreStart"), "planning"), "approaches");
         begin
            for I in 1 .. Length (Approaches) loop Append (Values, Create (Str_Field (Get (Approaches, I), "value"))); end loop;
            Set_Field (S, "enum", Values); Set_Field (P, "planApproach", S);
            Append (Required, Create ("planApproach"));
         end;
      elsif Step = "loadout" then
         declare S : constant JSON_Value := String_Schema; Values : JSON_Array := Empty_Array;
            Items : constant JSON_Value := Typed ("array"); Rule : constant JSON_Value := Create_Object;
            Choices : JSON_Array := Empty_Array; Empty_Choice : constant JSON_Value := Typed ("object");
            Full_Choice : constant JSON_Value := Create_Object;
         begin
            Append (Values, Create ("none")); Append (Values, Create ("light")); Append (Values, Create ("normal"));
            Append (Values, Create ("heavy")); Append (Values, Create ("encumbered"));
            Set_Field (S, "enum", Values); Set_Field (P, "commitment", S);
            declare
               Item_Schema : constant JSON_Value := String_Schema;
               Item_Names : Names.Set;
               Allowed : JSON_Array := Empty_Array;
               Gear : constant JSON_Value := Get (Character, "gear");
               Available : constant JSON_Array := Get (Gear, "availableGear");
               Current : constant JSON_Array := Get (Gear, "loadout");
            begin
               for I in 1 .. Length (Available) loop Item_Names.Include (Str_Field (Get (Available, I), "name")); end loop;
               for I in 1 .. Length (Current) loop Item_Names.Include (Str_Field (Get (Current, I), "name")); end loop;
               for Name of Item_Names loop Append (Allowed, Create (Name)); end loop;
               Set_Field (Item_Schema, "enum", Allowed);
               Set_Field (Items, "items", Item_Schema);
            end;
            Set_Field (Items, "uniqueItems", True); Set_Field (P, "items", Items);
            Set_Field (Empty_Choice, "maxProperties", Integer'(0));
            declare A : JSON_Array := One_Required ("commitment"); begin Append (A, Create ("items")); Set_Field (Full_Choice, "required", A); end;
            Append (Choices, Empty_Choice); Append (Choices, Full_Choice);
            Set_Field (Rule, "anyOf", Choices); Append (Rules, Rule);
         end;
      elsif Step = "engagement" or else Step = "entanglements" then
         Set_Field (P, "note", String_Schema);
      elsif Step = "scoundrel-xp" then
         declare
            A : constant JSON_Value := Create_Object;
            Keys : JSON_Array := One_Required ("Playbook");
            Attributes : constant JSON_Array := Get (Get (Character, "talent"), "attributes");
            Playbook : constant JSON_Value := Get (Get (Character, "playbook"), "experience");
            Room : Integer := Int_Field (Playbook, "max") - Int_Field (Playbook, "points");
         begin
            Set_Field (A, "Playbook", Integer_Schema (0, Room));
            for I in 1 .. Length (Attributes) loop
               declare Attribute : constant JSON_Value := Get (Attributes, I); X : constant JSON_Value := Get (Attribute, "experience");
                  Available : constant Integer := Int_Field (X, "max") - Int_Field (X, "points");
               begin
                  Set_Field (A, Str_Field (Attribute, "name"), Integer_Schema (0, Available));
                  Append (Keys, Create (Str_Field (Attribute, "name")));
                  Room := Room + Available;
               end;
            end loop;
            Set_Field (P, "allocations", Object_Schema (A, Keys));
            Set_Field (P, "total", Integer_Schema (0, Room));
            Append (Required, Create ("total")); Append (Required, Create ("allocations"));
         end;
      elsif Step = "payoff" then
         Crew_Delta ("crewCoin", "coin"); Crew_Delta ("crewRep", "rep");
         declare Fund : constant JSON_Value := Get (Character, "fund"); Satchel : constant JSON_Value := Get (Fund, "satchel"); begin
            --  fund.gain may retain overflow in stash, preserving its existing
            --  typed remainder side effects; spending draws only from satchel.
            Set_Field (P, "myShare", Integer_Schema (-Int_Field (Satchel, "coins"), Integer'Last));
         end;
      elsif Step = "heat" then Crew_Delta ("crewHeat", "heat");
      elsif Step = "crew-xp" then Crew_Delta ("crewXp", "experience");
      elsif Step = "crew-rep" then Crew_Delta ("crewRep", "rep");
      end if;
      if Crew.Kind = JSON_Object_Type and then
        (Step = "payoff" or else Step = "heat" or else Step = "crew-xp" or else Step = "crew-rep")
      then Set_Field (P, "crewRevision", Integer_Schema (0, Integer'Last)); end if;
      declare S : constant JSON_Value := Object_Schema (P, Required); begin
         if Length (Rules) > 0 then Set_Field (S, "allOf", Rules); end if;
         return S;
      end;
   end Input_Schema;

   function Completion_Schema (Character, Crew : JSON_Value; Kind, Step : String) return JSON_Value is
      P : constant JSON_Value := Create_Object;
      Required : JSON_Array := Empty_Array;
      Schema, Rule, Condition, Condition_Props, Skip_Inputs, Empty_Inputs : JSON_Value;
      Conditions : JSON_Array := Empty_Array;
      Step_Inputs : constant JSON_Value := Input_Schema (Character, Crew, Kind, Step);
      Inputs_View : constant JSON_Value := Typed ("object");
   begin
      Set_Field (P, "completionId", String_Schema (True));
      Set_Field (P, "instanceId", Fixed (Create (Instance_Id (Character))));
      Set_Field (P, "kind", Fixed (Create (Kind)));
      Set_Field (P, "step", Fixed (Create (Step)));
      Set_Field (P, "skip", Typed ("boolean"));
      Set_Field (Inputs_View, "properties", JSON_Value'(Get (Step_Inputs, "properties")));
      Set_Field (Inputs_View, "additionalProperties", False);
      Set_Field (P, "inputs", Inputs_View);
      Append (Required, Create ("completionId")); Append (Required, Create ("instanceId"));
      Append (Required, Create ("kind")); Append (Required, Create ("step")); Append (Required, Create ("inputs"));
      Schema := Object_Schema (P, Required);
      Condition_Props := Create_Object; Set_Field (Condition_Props, "skip", Fixed (Create (True)));
      Condition := Typed ("object"); Set_Field (Condition, "properties", Condition_Props); Set_Field (Condition, "required", One_Required ("skip"));
      Empty_Inputs := Typed ("object"); Set_Field (Empty_Inputs, "maxProperties", Integer'(0));
      Skip_Inputs := Create_Object; Set_Field (Skip_Inputs, "inputs", Empty_Inputs);
      Rule := Create_Object; Set_Field (Rule, "if", Condition);
      declare Then_Schema : constant JSON_Value := Create_Object; Else_Schema : constant JSON_Value := Create_Object;
         Else_Props : constant JSON_Value := Create_Object;
      begin
         Set_Field (Then_Schema, "properties", Skip_Inputs); Set_Field (Rule, "then", Then_Schema);
         Set_Field (Else_Props, "inputs", Step_Inputs);
         Set_Field (Else_Schema, "properties", Else_Props); Set_Field (Rule, "else", Else_Schema);
      end;
      Append (Conditions, Rule); Set_Field (Schema, "allOf", Conditions);
      return Schema;
   end Completion_Schema;

   function Projection (Character : JSON_Value; Crew : JSON_Value := JSON_Null) return JSON_Value is
      V : constant JSON_Value := Create_Object;
      F : constant JSON_Value := Get (Character, "modeFlow");
      Kind : constant String := Str_Field (F, "kind"); Step : constant String := Str_Field (F, "step");
      --  A Score with no active cursor (after Close, Leave, or a finished Engagement)
      --  still offers its entry steps, so the scoundrel can re-enter the Score.
      A : constant JSON_Array :=
        Steps (if Kind = "none" and then Str_Field (Character, "mode") = "score" then "score-start" else Kind);
      Actions : JSON_Array := Empty_Array;
      Previous : constant JSON_Value := Destination (Kind, Step, -1);
      Following : constant JSON_Value := Destination (Kind, Step, 1);
      R : JSON_Value := JSON_Null;
   begin
      Set_Field (V, "characterId", Str_Field (Character, "id"));
      Set_Field (V, "revision", Int_Field (Character, "revision"));
      Set_Field (V, "crew", Crew_Version (Crew)); Set_Field (V, "mode", Str_Field (Character, "mode"));
      Set_Field (V, "kind", Kind); Set_Field (V, "step", Step); Set_Field (V, "instanceId", Instance_Id (Character));
      Set_Field (V, "steps", A); Set_Field (V, "back", Previous); Set_Field (V, "next", Following);
      Set_Field (V, "skippable", Kind /= "none");
      if Kind /= "none" then
         R := Pitd_Transactions.Active_Receipt (Str_Field (Character, "id"), Instance_Id (Character), Kind, Step);
         declare Action : constant JSON_Value := Create_Object; P : constant JSON_Value := Create_Object;
            Required : JSON_Array := Empty_Array;
         begin
            if R.Kind = JSON_Object_Type then
               Set_Field (Action, "id", "next");
               if Following.Kind = JSON_String_Type then
                  Set_Field (Action, "op", "mode.flow.set");
                  Set_Field (P, "kind", Fixed (Create (Kind))); Set_Field (P, "step", Fixed (Following));
                  Append (Required, Create ("kind")); Append (Required, Create ("step"));
               elsif Kind = "resolution" then
                  Set_Field (Action, "op", "mode.set"); Set_Field (P, "mode", Fixed (Create ("downtime")));
                  Append (Required, Create ("mode"));
               else
                  Set_Field (Action, "op", "mode.flow.set"); Set_Field (P, "kind", Fixed (Create ("none")));
                  Set_Field (P, "step", Fixed (Create (""))); Append (Required, Create ("kind")); Append (Required, Create ("step"));
               end if;
               Set_Field (Action, "inputSchema", Object_Schema (P, Required));
            else
               Set_Field (Action, "id", "complete"); Set_Field (Action, "op", Completion_Op);
               Set_Field (Action, "inputSchema", Completion_Schema (Character, Crew, Kind, Step));
            end if;
            Append (Actions, Action);
         end;
      end if;
      Set_Field (V, "actions", Actions); Set_Field (V, "receipt", R); Set_Field (V, "guidance", Guidance);
      return V;
   end Projection;

   function Complete
     (Character, Crew, Body_Value : JSON_Value; Expected_Revision : String;
      Plan : JSON_Value; Changed, Crew_Changed : out Boolean;
      Stored_Receipt : JSON_Value := JSON_Null) return JSON_Value is
      B : JSON_Value renames Body_Value;
      Inputs : JSON_Value;
      Bad : Unbounded_String;
      Stored : JSON_Value;
      F : constant JSON_Value := Get (Character, "modeFlow");
      Kind : constant String := Str_Field (B, "kind"); Step : constant String := Str_Field (B, "step");
      Result : JSON_Value;
      Receipt_Value : JSON_Value;
      Hash : constant String := Payload_Hash (B);
      Side_Effects : JSON_Array := Empty_Array;
      function Invalid (Message : String) return JSON_Value is
        (Validation_Error (Completion_Op, Message, Root_Issues (Message), Character));
      function Apply (Entity_Kind, Op : String; E, Args : JSON_Value) return Boolean is
      begin
         if not Pitd_Ops.Validate_Request (Entity_Kind, Op, Args, Bad) then
            Result := Invalid (To_String (Bad)); return False;
         end if;
         Result := Pitd_Ops.Mutate (Entity_Kind, Op, E, Args);
         if not Bool_Field (Result, "ok") then
            Set_Field (Get (Result, "applied"), "op", Completion_Op); return False;
         end if;
         declare A : constant JSON_Array := Get (Result, "sideEffects"); begin
            for I in 1 .. Length (A) loop Append (Side_Effects, Get (A, I)); end loop;
         end;
         return True;
      end Apply;
      function Award (Name, Op : String) return Boolean is
         Amount : constant Integer := Int_Field (Inputs, Name);
         Args : constant JSON_Value := Create_Object;
      begin
         if Amount = 0 then return True; end if;
         Set_Field (Args, "delta", Amount);
         return Apply ("crew", Op, Crew, Args);
      end Award;
   begin
      Changed := False; Crew_Changed := False;
      if not Validate_Request (B, Bad) then return Invalid (To_String (Bad)); end if;
      Inputs := Get (B, "inputs");
      Stored := Stored_Receipt;
      if Stored.Kind = JSON_Null_Type then
         Stored := Pitd_Transactions.Receipt (Str_Field (Character, "id"), Str_Field (B, "completionId"));
      end if;
      --  A batch can replay an earlier staged completion without publishing it.
      if Stored.Kind = JSON_Null_Type then
         declare Receipts : constant JSON_Array := Get (Plan, "receipts"); begin
            for I in 1 .. Length (Receipts) loop
               declare Item : constant JSON_Value := Get (Receipts, I); begin
                  if Str_Field (Item, "characterId") = Str_Field (Character, "id")
                    and then Str_Field (Get (Item, "receipt"), "completionId") = Str_Field (B, "completionId")
                  then Stored := Item; exit; end if;
               end;
            end loop;
         end;
      end if;
      if Stored.Kind = JSON_Object_Type then
         if Str_Field (Stored, "payloadHash") /= Hash then
            return Error_Value (Completion_Op, "VALIDATION", 400,
              "completion ID already used with a different body", False, "refresh",
              Pointer_Details (Root_Issues ("completion ID already used with a different body")), Character);
         end if;
         Result := Success_Result (Completion_Op, Character);
         Set_Field (Result, "receipt", JSON_Value'(Get (Stored, "receipt")));
         if Has_Field (Stored, "sideEffects") then
            declare Effects : constant JSON_Value := Get (Stored, "sideEffects"); begin
               Set_Field (Result, "sideEffects", Effects);
            end;
         else
            declare Effects : constant JSON_Array := Empty_Array; begin
               Set_Field (Result, "sideEffects", Effects);
            end;
         end if;
         return Result;
      end if;
      if Expected_Revision = "" then return Invalid ("flow completion requires If-Match"); end if;
      if Expected_Revision /= Trim_Image (Int_Field (Character, "revision")) then
         return Stale_Error (Completion_Op, Character, Int_Field (Character, "revision"));
      end if;
      if Instance_Id (Character) /= Str_Field (B, "instanceId")
        or else Str_Field (F, "kind") /= Kind or else Str_Field (F, "step") /= Step
      then return Stale_Error (Completion_Op, Character, Int_Field (Character, "revision")); end if;
      Stored := Pitd_Transactions.Active_Receipt (Str_Field (Character, "id"), Instance_Id (Character), Kind, Step);
      if Stored.Kind = JSON_Null_Type then
         declare Receipts : constant JSON_Array := Get (Plan, "receipts"); begin
            for I in 1 .. Length (Receipts) loop
               declare R : constant JSON_Value := Get (Get (Receipts, I), "receipt"); begin
                  if Str_Field (Get (Receipts, I), "characterId") = Str_Field (Character, "id")
                    and then Str_Field (R, "instanceId") = Instance_Id (Character)
                    and then Str_Field (R, "kind") = Kind and then Str_Field (R, "step") = Step
                    and then Str_Field (R, "status") = "completed"
                  then Stored := R; exit; end if;
               end;
            end loop;
         end;
      end if;
      if Stored.Kind = JSON_Object_Type then return Invalid ("step already completed; use its navigation action"); end if;
      if Bool_Field (B, "skip") then
         if not Only_Fields (Inputs, "|") then return Invalid ("skip inputs must be empty"); end if;
      else
         declare Allowed : constant String :=
           (if Step = "planning" then "|planApproach|"
            elsif Step = "loadout" then "|commitment|items|"
            elsif Step = "engagement" or else Step = "entanglements" then "|note|"
            elsif Step = "scoundrel-xp" then "|total|allocations|"
            elsif Step = "payoff" then "|crewRevision|crewCoin|crewRep|myShare|"
            elsif Step = "heat" then "|crewRevision|crewHeat|"
            elsif Step = "crew-xp" then "|crewRevision|crewXp|" else "|crewRevision|crewRep|");
         begin if not Only_Fields (Inputs, Allowed) then return Invalid ("inputs do not belong to this step"); end if; end;
         if Touches_Crew (B) then
            if Crew.Kind /= JSON_Object_Type then return Invalid ("crew award requires a linked crew"); end if;
            if not Has_Field (Inputs, "crewRevision") then return Invalid ("crew award requires crewRevision"); end if;
            if Int_Field (Inputs, "crewRevision") /= Int_Field (Crew, "revision") then
               return Stale_Error (Completion_Op, Crew, Int_Field (Crew, "revision"));
            end if;
            if Str_Field (Crew, "gameStem") /= Str_Field (Character, "gameStem") then
               return Invalid ("crew and character editions differ");
            end if;
         elsif Has_Field (Inputs, "crewRevision") then return Invalid ("crewRevision is only valid for a nonzero crew award"); end if;
         --  Generic crew operations clamp by design. A guided completion
         --  admits the explicit requested award only if it fits the published
         --  track room, then delegates the actual effects to those operations.
         declare
            Schema : constant JSON_Value := Input_Schema (Character, Crew, Kind, Step);
            Properties : constant JSON_Value := Get (Schema, "properties");
            Bounds_Ok : Boolean := True;
            procedure Check_Bounds (Name : UTF8_String; Value : JSON_Value) is
            begin
               if Value.Kind = JSON_Int_Type and then Has_Field (Properties, Name) then
                  declare
                     Limit : constant JSON_Value := Get (Properties, Name);
                     Amount : constant Integer := Get (Value);
                  begin
                     if Has_Field (Limit, "minimum") and then Amount < Int_Field (Limit, "minimum") then Bounds_Ok := False; end if;
                     if Has_Field (Limit, "maximum") and then Amount > Int_Field (Limit, "maximum") then Bounds_Ok := False; end if;
                  end;
               elsif Name = "allocations" and then Has_Field (Properties, Name) then
                  declare
                     Limits : constant JSON_Value := Get (Get (Properties, Name), "properties");
                     procedure Check_Allocation (Track_Name : UTF8_String; Amount : JSON_Value) is
                     begin
                        if not Has_Field (Limits, Track_Name)
                          or else Integer'(Get (Amount)) > Int_Field (Get (Limits, Track_Name), "maximum")
                        then Bounds_Ok := False; end if;
                     end Check_Allocation;
                  begin Map_JSON_Object (Value, Check_Allocation'Access); end;
               end if;
            end Check_Bounds;
         begin
            Map_JSON_Object (Inputs, Check_Bounds'Access);
            if not Bounds_Ok then return Invalid ("award exceeds the current track bounds"); end if;
         end;
         if Step = "planning" then
            declare
               Approaches : constant JSON_Array := Get (Get (Get (Flow_Data, "scoreStart"), "planning"), "approaches");
               Found : Boolean := False;
            begin
               for I in 1 .. Length (Approaches) loop
                  if Str_Field (Get (Approaches, I), "value") = Str_Field (Inputs, "planApproach") then Found := True; end if;
               end loop;
               if not Found then return Invalid ("choose a plan approach from guidance or skip"); end if;
            end;
         elsif Step = "loadout" then
            if not Only_Fields (Inputs, "|") and then not Apply ("character", "gear.set-loadout", Character, Inputs) then return Result; end if;
         elsif Step = "scoundrel-xp" then
            if not Apply ("character", "xp.resolve", Character, Inputs) then return Result; end if;
         elsif Step = "payoff" then
            if not Award ("crewCoin", "coin.add") or else not Award ("crewRep", "rep.add") then return Result; end if;
            declare Amount : constant Integer := Int_Field (Inputs, "myShare"); Args : constant JSON_Value := Create_Object; begin
               if Amount /= 0 then
                  Set_Field (Args, "coins", abs Amount);
                  if not Apply ("character", (if Amount > 0 then "fund.gain" else "fund.spend"), Character, Args) then return Result; end if;
               end if;
            end;
         elsif Step = "heat" then if not Award ("crewHeat", "heat.add") then return Result; end if;
         elsif Step = "crew-xp" then if not Award ("crewXp", "xp.add") then return Result; end if;
         elsif Step = "crew-rep" then if not Award ("crewRep", "rep.add") then return Result; end if;
         end if;
      end if;
      declare
         P : constant JSON_Value := Get (Character, "flowProgress");
         Following : constant JSON_Value := Destination (Kind, Step, 1);
      begin
         Set_Field (P, "instanceId", Instance_Id (Character)); Set_Field (P, "kind", Kind);
         if not Bool_Field (B, "skip") then
            if Step = "planning" then Set_Field (P, "planApproach", Str_Field (Inputs, "planApproach")); end if;
            if Has_Field (Inputs, "note") then
               declare Notes : JSON_Array := Get (P, "notes"); Note : constant JSON_Value := Create_Object; begin
                  Set_Field (Note, "step", Step); Set_Field (Note, "text", Str_Field (Inputs, "note"));
                  Append (Notes, Note); Set_Field (P, "notes", Notes);
               end;
            end if;
         end if;
         if Following.Kind = JSON_String_Type then Set_Field (F, "step", String'(Get (Following)));
         else
            Set_Field (F, "kind", "none"); Set_Field (F, "step", "");
            if Kind = "resolution" then Set_Field (Character, "mode", "downtime"); end if;
         end if;
      end;
      Receipt_Value := Create_Object;
      Set_Field (Receipt_Value, "completionId", Str_Field (B, "completionId"));
      Set_Field (Receipt_Value, "transactionId", Str_Field (Plan, "id"));
      Set_Field (Receipt_Value, "instanceId", Str_Field (B, "instanceId"));
      Set_Field (Receipt_Value, "kind", Kind); Set_Field (Receipt_Value, "step", Step);
      Set_Field (Receipt_Value, "status", "completed"); Set_Field (Receipt_Value, "skipped", Bool_Field (B, "skip"));
      Set_Field (Receipt_Value, "inputs", Clone (Inputs));
      Set_Field (Receipt_Value, "characterRevision", Int_Field (Character, "revision") + 1);
      if Touches_Crew (B) then
         declare V : constant JSON_Value := Crew_Version (Crew); begin
            Set_Field (V, "revision", Int_Field (Crew, "revision") + 1); Set_Field (Receipt_Value, "crew", V);
         end;
      else Set_Field (Receipt_Value, "crew", JSON_Null); end if;
      Pitd_Transactions.Stage_Receipt (Plan, Receipt_Value, Str_Field (Character, "id"), Hash, Side_Effects);
      Changed := True; Crew_Changed := Touches_Crew (B);
      Result := Success_Result (Completion_Op, Character);
      Set_Field (Result, "sideEffects", Side_Effects); Set_Field (Result, "receipt", Receipt_Value);
      return Result;
   end Complete;
end Pitd_Flow;
