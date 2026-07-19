with Ada.Calendar;
with Ada.Calendar.Formatting;
with Ada.Directories;
with Ada.Exceptions;
with Ada.Streams.Stream_IO;
with Ada.Strings.Fixed;
with Ada.Strings.Unbounded;
with Ada.Text_IO;

with AWS.Headers;
with AWS.Messages;
with AWS.MIME;
with AWS.Response;
with AWS.Response.Set;
with AWS.Status;
with AWS.Utils;
with GNATCOLL.JSON;
with GNAT.OS_Lib;
with Paperclips_Core;
with Paperclips_Core.Bounded_Integers;
with System;

package body Pitd_Callback is
   use Ada.Strings.Unbounded;
   use GNATCOLL.JSON;
   use type Ada.Directories.File_Kind;
   use type AWS.Status.Request_Method;

   Static_Root : Unbounded_String := To_Unbounded_String ("./frontend/dist");
   Data_Root   : Unbounded_String := To_Unbounded_String ("./campaign-data");
   Games_Root  : Unbounded_String := To_Unbounded_String ("./data/games");
   Hooks       : Boolean := False;
   Last_Idempotency_Key : Unbounded_String;
   Last_Idempotency_Response : Unbounded_String;
   protected Revision_Gate is
      procedure Claim (Id : String; Revision : Integer; Granted : out Boolean);
   private
      Last_Id : Unbounded_String;
      Last_Revision : Integer := -1;
   end Revision_Gate;
   protected body Revision_Gate is
      procedure Claim (Id : String; Revision : Integer; Granted : out Boolean) is
      begin
         Granted := not (To_String(Last_Id)=Id and then Last_Revision=Revision);
         if Granted then Last_Id:=To_Unbounded_String(Id);Last_Revision:=Revision;end if;
      end Claim;
   end Revision_Gate;

   Max_Import  : constant := 1_024 * 1_024;
   type Level_Array is array (Positive range <>) of Unbounded_String;

   function Trim_Image (N : Integer) return String is
     (Ada.Strings.Fixed.Trim (Integer'Image (N), Ada.Strings.Both));

   function Path_Only (URI : String) return String is
      Q : Natural := 0;
   begin
      for I in URI'Range loop
         if URI (I) = '?' then Q := I; exit; end if;
      end loop;
      return (if Q = 0 then URI elsif Q = URI'First then "/"
              else URI (URI'First .. Q - 1));
   end Path_Only;

   function Query_Of (URI : String) return String is
   begin
      for I in URI'Range loop
         if URI (I) = '?' then
            return (if I = URI'Last then "" else URI (I + 1 .. URI'Last));
         end if;
      end loop;
      return "";
   end Query_Of;

   function Safe (Value : String) return Boolean is
   begin
      if Value'Length = 0 then return False; end if;
      for C of Value loop
         if not (C in 'A' .. 'Z' or else C in 'a' .. 'z'
                 or else C in '0' .. '9' or else C = '-')
         then return False; end if;
      end loop;
      return True;
   end Safe;

   function Slashes (Path : String) return Natural is
      N : Natural := 0;
   begin
      for C of Path loop if C = '/' then N := N + 1; end if; end loop;
      return N;
   end Slashes;

   function Part (Path : String; Number : Positive) return String is
      Start : Natural := Path'First;
      Seen  : Natural := 0;
   begin
      while Start <= Path'Last and then Path (Start) = '/' loop Start := Start + 1; end loop;
      for I in Start .. Path'Last + 1 loop
         if I > Path'Last or else Path (I) = '/' then
            Seen := Seen + 1;
            if Seen = Number then
               return (if I = Start then "" else Path (Start .. I - 1));
            end if;
            Start := I + 1;
         end if;
      end loop;
      return "";
   end Part;

   function Now return String is
      S : constant String := Ada.Calendar.Formatting.Image
        (Ada.Calendar.Clock, Include_Time_Fraction => True);
   begin
      return S & "Z";
   end Now;

   function New_Id return String is
      R : constant String := AWS.Utils.Random_String (32);
      function H (C : Character) return Character is
         V : constant Natural := Character'Pos (C) mod 16;
      begin
         return (if V < 10 then Character'Val (Character'Pos ('0') + V)
                 else Character'Val (Character'Pos ('a') + V - 10));
      end H;
      X : String (1 .. 32);
   begin
      for I in X'Range loop X (I) := H (R (I)); end loop;
      X (13) := '4';
      X (17) := '8';
      return X (1 .. 8) & "-" & X (9 .. 12) & "-" & X (13 .. 16) & "-"
        & X (17 .. 20) & "-" & X (21 .. 32);
   end New_Id;

   function Read_File (Name : String) return String is
      F    : GNAT.OS_Lib.File_Descriptor := GNAT.OS_Lib.Open_Read (Name, GNAT.OS_Lib.Binary);
      Size : constant Long_Integer := GNAT.OS_Lib.File_Length (F);
   begin
      declare
         Text : String (1 .. Integer (Size));
         Last : Integer;
      begin
         Last := GNAT.OS_Lib.Read (F, Text'Address, Text'Length);
         GNAT.OS_Lib.Close (F);
         if Last /= Text'Length then raise Ada.Text_IO.End_Error; end if;
         return Text;
      end;
   end Read_File;

   procedure Atomic_Write (Name : String; Value : JSON_Value) is
      Tmp : constant String := Name & ".tmp";
      F   : Ada.Text_IO.File_Type;
      Dir : constant String := Ada.Directories.Containing_Directory (Name);
      Renamed : Boolean;
   begin
      if not Ada.Directories.Exists (Dir) then Ada.Directories.Create_Path (Dir); end if;
      Ada.Text_IO.Create (F, Ada.Text_IO.Out_File, Tmp);
      Ada.Text_IO.Put (F, Write (Value, Compact => False));
      Ada.Text_IO.New_Line (F);
      Ada.Text_IO.Flush (F);
      Ada.Text_IO.Close (F);
      GNAT.OS_Lib.Rename_File (Tmp, Name, Renamed);
      if not Renamed then raise Ada.Text_IO.Device_Error with "atomic rename failed"; end if;
   end Atomic_Write;

   function Entity_Dir (Kind, Id : String) return String is
     (To_String (Data_Root) & "/" & Kind & "s/" & Id);
   function Current_File (Kind, Id : String) return String is
     (Entity_Dir (Kind, Id) & "/current.json");

   function Read_Entity (Kind, Id : String) return JSON_Value is
      Name : constant String := Current_File (Kind, Id);
   begin
      if not Ada.Directories.Exists (Name) then return JSON_Null; end if;
      declare V : constant JSON_Value := Read (Read_File (Name)); begin
         if Integer'(Get (V, "formatVersion")) /= 1 then return JSON_Null; end if;
         return V;
      end;
   end Read_Entity;

   procedure Write_Entity (Kind, Id : String; Entity : JSON_Value) is
   begin
      Atomic_Write (Current_File (Kind, Id), Entity);
   end Write_Entity;

   function All_Entities (Kind : String) return JSON_Array is
      Base : constant String := To_String(Data_Root)&"/"&Kind&"s";
      Search : Ada.Directories.Search_Type; Dir_Item : Ada.Directories.Directory_Entry_Type;
      Out_A : JSON_Array := Empty_Array;
   begin
      if not Ada.Directories.Exists(Base) then return Out_A;end if;
      Ada.Directories.Start_Search(Search,Base,"*",(Ada.Directories.Directory=>True,others=>False));
      while Ada.Directories.More_Entries(Search) loop Ada.Directories.Get_Next_Entry(Search,Dir_Item);declare N:constant String:=Ada.Directories.Simple_Name(Dir_Item);V:JSON_Value;begin if N/="." and then N/=".." then V:=Read_Entity(Kind,N);if V.Kind=JSON_Object_Type then Append(Out_A,V);end if;end if;end;end loop;Ada.Directories.End_Search(Search);return Out_A;
   end All_Entities;

   procedure Snapshot (Kind,Id,Op:String;Entity:JSON_Value) is
      H:JSON_Value:=Create_Object;M:JSON_Value:=Create_Object;Sid:constant String:=New_Id;
   begin Set_Field(M,"snapshotId",Sid);Set_Field(M,"takenAt",Now);Set_Field(M,"op",Op);Set_Field(H,"_snapshot",M);Set_Field(H,"entity",Clone(Entity));Atomic_Write(Entity_Dir(Kind,Id)&"/history/"&Sid&".json",H);end Snapshot;

   function History (Kind,Id:String) return JSON_Array is
      Base:constant String:=Entity_Dir(Kind,Id)&"/history";Search:Ada.Directories.Search_Type;Dir_Item:Ada.Directories.Directory_Entry_Type;O:JSON_Array:=Empty_Array;
   begin if not Ada.Directories.Exists(Base) then return O;end if;Ada.Directories.Start_Search(Search,Base,"*.json",(Ada.Directories.Ordinary_File=>True,others=>False));while Ada.Directories.More_Entries(Search) loop Ada.Directories.Get_Next_Entry(Search,Dir_Item);declare V:constant JSON_Value:=Read(Read_File(Ada.Directories.Full_Name(Dir_Item)));begin Append(O,Get(V,"_snapshot"));end;end loop;Ada.Directories.End_Search(Search);return O;end History;

   function Empty_Object return JSON_Value is (Create_Object);
   function Empty_List return JSON_Value is (Create (Empty_Array));
   function Str_Field (V : JSON_Value; Name : String; Default : String := "") return String;

   function Error_Result
     (Op, Code, Message : String; Entity : JSON_Value := JSON_Null)
      return JSON_Value
   is
      R : JSON_Value := Create_Object;
      A : JSON_Value := Create_Object;
      E : JSON_Value := Create_Object;
   begin
      Set_Field (A, "op", Op); Set_Field (E, "code", Code); Set_Field (E, "message", Message);
      Set_Field (R, "ok", False); Set_Field (R, "applied", A);
      Set_Field (R, "sideEffects", Empty_Array); Set_Field (R, "error", E);
      if Entity.Kind = JSON_Object_Type then Set_Field (R, Str_Field (Entity, "kind"), Entity); end if;
      return R;
   end Error_Result;

   function Success_Result
     (Op : String; Entity : JSON_Value; Requested : Integer := Integer'First;
      Effective : Integer := Integer'First; Landed : String := "";
      Side : String := "") return JSON_Value
   is
      R : JSON_Value := Create_Object;
      A : JSON_Value := Create_Object;
      S : JSON_Array := Empty_Array;
   begin
      Set_Field (A, "op", Op);
      if Requested /= Integer'First then Set_Field (A, "requested", Requested); end if;
      if Effective /= Integer'First then Set_Field (A, "effective", Effective); end if;
      if Landed /= "" then Set_Field (A, "landedIntensity", Landed); end if;
      if Side /= "" then Append (S, Create (Side)); end if;
      Set_Field (R, "ok", True); Set_Field (R, "applied", A);
      Set_Field (R, "sideEffects", S); Set_Field (R, "error", JSON_Null);
      Set_Field (R, Str_Field (Entity, "kind"), Entity);
      return R;
   end Success_Result;

   function Json_Response
     (Value : JSON_Value; Status : AWS.Messages.Status_Code := AWS.Messages.S200)
      return AWS.Response.Data is
     (AWS.Response.Build ("application/json; charset=utf-8", String'(Write (Value, Compact => False)) & ASCII.LF, Status));

   function Json_Text
     (Value : String; Status : AWS.Messages.Status_Code := AWS.Messages.S200)
      return AWS.Response.Data is
     (AWS.Response.Build ("application/json; charset=utf-8", Value, Status));

   function Fail (Status : AWS.Messages.Status_Code; Op, Code : String;
                  Entity : JSON_Value := JSON_Null; Message : String := "not found")
                  return AWS.Response.Data is
     (Json_Response (Error_Result (Op, Code, Message, Entity), Status));

   function Parse_Body (Request : AWS.Status.Data) return JSON_Value is
   begin
      if Natural (AWS.Status.Content_Length (Request)) > Max_Import then
         raise Constraint_Error with "request exceeds 1 MiB";
      end if;
      declare S : constant String := To_String (AWS.Status.Binary_Data (Request)); begin
         return (if S = "" then Create_Object else Read (S));
      end;
   end Parse_Body;

   function Header (Request : AWS.Status.Data; Name : String) return String is
     (AWS.Headers.Get_Values (AWS.Status.Header (Request), Name));

   function Int_Field (V : JSON_Value; Name : String; Default : Integer := 0) return Integer is
     (if V.Kind = JSON_Object_Type and then Has_Field (V, Name)
      and then Get (V, Name).Kind = JSON_Int_Type then Get (V, Name) else Default);
   function Str_Field (V : JSON_Value; Name : String; Default : String := "") return String is
     (if V.Kind = JSON_Object_Type and then Has_Field (V, Name)
      and then Get (V, Name).Kind = JSON_String_Type then Get (V, Name) else Default);
   function Bool_Field (V : JSON_Value; Name : String; Default : Boolean := False) return Boolean is
     (if V.Kind = JSON_Object_Type and then Has_Field (V, Name)
      and then Get (V, Name).Kind = JSON_Boolean_Type then Get (V, Name) else Default);
   function Array_Length (V : JSON_Value; Name : String) return Natural is
      A : constant JSON_Array := Get (V, Name);
   begin return Length (A); end Array_Length;

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

   function Game (Stem : String) return JSON_Value is
      Name : constant String := To_String (Games_Root) & "/" & Stem & ".json";
   begin
      if not Safe (Stem) or else not Ada.Directories.Exists (Name) then return JSON_Null; end if;
      return Read (Read_File (Name));
   end Game;

   function New_Character (Stem, Playbook : String) return JSON_Value is
      G : constant JSON_Value := Game (Stem);
      Id : constant String := New_Id;
      T : constant String := Now;
      C : JSON_Value;
      --  The stable DTO skeleton is intentionally explicit: it is the JSON boundary.
      Template : constant String :=
        "{""kind"":""character"",""id"":""" & Id & """,""gameStem"":""" & Stem
        & """,""gameName"":""" & Str_Field (G, "Name") & """,""language"":"""
        & Str_Field (G, "Language", "English") & """,""revision"":1,""formatVersion"":1,""createdAt"":"""
        & T & """,""updatedAt"":""" & T
        & """,""isRetired"":false,""isDeadish"":false,""dossier"":{""name"":"""",""crewId"":"""",""alias"":"""",""look"":"""",""notes"":"""",""background"":{""name"":"""",""description"":""""},""heritage"":{""name"":"""",""description"":""""},""vice"":{""name"":"""",""description"":""""}},""monitor"":{""stress"":{""current"":0,""max"":9},""trauma"":{""traumas"":[],""max"":4},""harm"":{""lesser"":[],""moderate"":[],""severe"":[],""fatal"":[],""healingClock"":{""segments"":0,""size"":"
        & Trim_Image (Int_Field (G, "RecoveryClockSize", 4))
        & ",""rollover"":0}},""armor"":{""standardUsed"":false,""heavyUsed"":false,""specialUsed"":false,""hasStandard"":false,""hasHeavy"":false,""hasSpecial"":false}},""talent"":{""attributes"":[]},""playbook"":{""name"":"""
        & Playbook & """,""experience"":{""points"":0,""max"":8},""abilities"":[]},""gear"":{""loadout"":[],""availableGear"":[],""commitment"":"""",""isCommitmentLocked"":false,""maxBulk"":9},""fund"":{""satchel"":{""coins"":2,""max"":4},""stash"":{""coins"":0,""max"":40}},""rolodex"":{""friends"":[]},""session"":{""playbookExpressions"":0,""characterExpressions"":0,""struggleExpressions"":0,""max"":3},""notebook"":""""}";
   begin
      C := Read (Template);
      --  Build attributes/actions and playbook defaults from game-settings JSON.
      if G.Kind = JSON_Object_Type and then Has_Field (G, "Attributes") then
         declare Out_A : JSON_Array := Empty_Array; Attrs : constant JSON_Array := Get (G, "Attributes"); begin
            for I in 1 .. Length (Attrs) loop
               declare A0 : constant JSON_Value := Get (Attrs, I); A : JSON_Value := Create_Object;
                  XP : JSON_Value := Create_Object; Acts : JSON_Array := Empty_Array;
               begin
                  Set_Field (A, "name", Str_Field (A0, "Name")); Set_Field (XP, "points", Integer'(0)); Set_Field (XP, "max", Integer'(6)); Set_Field (A, "experience", XP);
                  if Has_Field (A0, "Actions") then
                     declare AA : constant JSON_Array := Get (A0, "Actions"); begin
                        for J in 1 .. Length (AA) loop
                           declare X : JSON_Value := Create_Object; begin
                              Set_Field (X, "name", Str_Field (Get (AA, J), "Name")); Set_Field (X, "rating", Integer'(0));
                              Set_Field (X, "maxRating", Int_Field (G, "ActionPointMaximum", 4)); Append (Acts, X);
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
      G : constant JSON_Value := Game (Stem); Id : constant String := New_Id; T : constant String := Now;
   begin
      return Read ("{""kind"":""crew"",""id"":""" & Id & """,""gameStem"":""" & Stem
        & """,""gameName"":""" & Str_Field (G,"Name") & """,""language"":""" & Str_Field (G,"Language","English")
        & """,""revision"":1,""formatVersion"":1,""createdAt"":""" & T & """,""updatedAt"":""" & T
        & """,""crewTypeName"":""" & Crew_Type & """,""name"":"""",""lair"":"""",""reputation"":"""",""huntingGrounds"":"""",""tier"":0,""hold"":""weak"",""heat"":{""current"":0,""max"":9},""wanted"":{""current"":0,""max"":4},""rep"":{""current"":0,""max"":12},""experience"":{""points"":0,""max"":10},""specialAbilities"":[],""upgrades"":[],""cohorts"":[],""coin"":0,""stash"":0,""notes"":""""}");
   end New_Crew;

   function New_Clock (B : JSON_Value) return JSON_Value is
      Id : constant String := New_Id; T : constant String := Now;
   begin
      return Read ("{""kind"":""clock"",""id"":""" & Id & """,""revision"":1,""formatVersion"":1,""createdAt"":""" & T & """,""updatedAt"":""" & T
        & """,""name"":""" & Str_Field (B,"name") & """,""clockKind"":""" & Str_Field (B,"clockKind","project")
        & """,""segments"":0,""size"":" & Trim_Image (Int_Field (B,"size",4)) & ",""rollover"":0}");
   end New_Clock;

   procedure Stamp (E : JSON_Value) is
   begin
      Set_Field (E, "revision", Int_Field (E, "revision") + 1);
      Set_Field (E, "updatedAt", Now);
   end Stamp;

   function Mutate (Kind, Op : String; E, B : JSON_Value) return JSON_Value is
      Requested : Integer := Integer'First; Effective : Integer := Integer'First;
      New_Value, Applied : Natural := 0;
      Target : JSON_Value;
   begin
      if Kind = "character" and then Bool_Field (E, "isRetired")
        and then Op /= "trauma.add" and then Op /= "trauma.remove"
      then return Error_Result (Op, "RETIRED", "character is retired", E); end if;

      if Op = "stress.add" then
         Target := Get (Get (E,"monitor"),"stress"); Requested := Int_Field (B,"delta");
         Core_Clamp_Add (Natural (Int_Field (Target,"current")), Natural (Int_Field (Target,"max")), Natural'Max (0, Requested), New_Value, Applied);
         Set_Field (Target,"current",Integer (New_Value)); Effective := Integer (Applied);
         return Success_Result (Op,E,Requested,Effective, Side => (if New_Value = Natural (Int_Field (Target,"max")) then "stress full — consider trauma" else ""));
      elsif Op = "stress.clear" then declare X : constant JSON_Value := Get (Get (E,"monitor"),"stress"); begin Set_Field (X,"current",Integer'(0)); end;
      elsif Op = "trauma.add" or else Op = "trauma.remove" then
         declare T : constant JSON_Value := Get(Get(E,"monitor"),"trauma"); A : constant JSON_Array := Get(T,"traumas"); O : JSON_Array:=Empty_Array; Name:constant String:=Str_Field(B,"trauma"); Found:Boolean:=False; begin
            for I in 1..Length(A) loop if String'(Get(Get(A,I)))=Name then Found:=True;if Op="trauma.add" then Append(O,Get(A,I));end if;else Append(O,Get(A,I));end if;end loop;
            if Op="trauma.add" and then not Found then Append(O,Create(Name));end if;Set_Field(T,"traumas",O);Set_Field(E,"isRetired",Length(O)>=Natural(Int_Field(T,"max")));
         end;
      elsif Op = "harm.add" then
         declare H:constant JSON_Value:=Get(Get(E,"monitor"),"harm"); Start:constant String:=Str_Field(B,"intensity","lesser"); Desc:constant String:=Str_Field(B,"description"); Land:Unbounded_String; begin
            for Level of Level_Array'(To_Unbounded_String("lesser"),To_Unbounded_String("moderate"),To_Unbounded_String("severe"),To_Unbounded_String("fatal")) loop
               if (Start="lesser" or else To_String(Level)/="lesser") and then (Start/="severe" or else (To_String(Level)="severe" or else To_String(Level)="fatal")) and then (Start/="moderate" or else To_String(Level)/="lesser") and then (Start/="fatal" or else To_String(Level)="fatal") then
                  declare A:constant JSON_Array:=Get(H,To_String(Level));Cap:constant Natural:=(if To_String(Level)="lesser" or else To_String(Level)="moderate" then 2 else 1);begin if Length(A)<Cap and then Length(Land)=0 then declare O:JSON_Array:=A;begin Append(O,Create(Desc));Set_Field(H,To_String(Level),O);Land:=Level;end;end if;end;
               end if;
            end loop;
            if Length(Land)=0 then return Error_Result(Op,"SLOT_FULL_FATAL","all harm slots are full",E);end if;Set_Field(E,"isDeadish",Array_Length(H,"fatal")>0);return Success_Result(Op,E,Landed=>To_String(Land),Side=>(if To_String(Land)/=Start then "harm spilled to "&To_String(Land) else ""));
         end;
      elsif Op = "harm.remove" then
         declare H:constant JSON_Value:=Get(Get(E,"monitor"),"harm");Level:constant String:=Str_Field(B,"intensity");Desc:constant String:=Str_Field(B,"description");A:constant JSON_Array:=Get(H,Level);O:JSON_Array:=Empty_Array;Skipped:Boolean:=False;begin for I in 1..Length(A) loop if not Skipped and then String'(Get(Get(A,I)))=Desc then Skipped:=True;else Append(O,Get(A,I));end if;end loop;Set_Field(H,Level,O);Set_Field(E,"isDeadish",Array_Length(H,"fatal")>0);end;
      elsif Op = "armor.set" then
         declare A:constant JSON_Value:=Get(Get(E,"monitor"),"armor");Name:constant String:=Str_Field(B,"armor");Used:constant Boolean:=Bool_Field(B,"used");Key:constant String:=(if Name="standard" then "standardUsed" elsif Name="heavy" then "heavyUsed" else "specialUsed");Has:constant String:=(if Name="standard" then "hasStandard" elsif Name="heavy" then "hasHeavy" else "hasSpecial");begin if Used and then not Bool_Field(A,Has) then return Error_Result(Op,"ARMOR_NOT_AVAILABLE","armor is not available",E);end if;Set_Field(A,Key,Used);end;
      elsif Op = "playbook-xp.add" then
         Target := Get (Get (E,"playbook"),"experience"); Requested := Int_Field (B,"delta");
         Core_Clamp_Add (Natural (Int_Field(Target,"points")),Natural(Int_Field(Target,"max")),Natural'Max(0,Requested),New_Value,Applied);
         Set_Field(Target,"points",Integer(New_Value)); Effective:=Integer(Applied); return Success_Result(Op,E,Requested,Effective);
      elsif Op = "playbook-xp.clear" then declare X : constant JSON_Value := Get(Get(E,"playbook"),"experience"); begin Set_Field(X,"points",Integer'(0)); end;
      elsif Op = "action.set-rating" then
         declare Attrs:constant JSON_Array:=Get(Get(E,"talent"),"attributes");Name:constant String:=Str_Field(B,"action");Rating:constant Integer:=Int_Field(B,"rating");Found:Boolean:=False;begin if Rating<0 then return Error_Result(Op,"VALIDATION","invalid action rating",E);end if;for I in 1..Length(Attrs) loop declare Acts:constant JSON_Array:=Get(Get(Attrs,I),"actions");begin for J in 1..Length(Acts) loop declare X:constant JSON_Value:=Get(Acts,J);begin if Str_Field(X,"name")=Name then Set_Field(X,"rating",Integer'Min(Rating,Int_Field(X,"maxRating")));Found:=True;end if;end;end loop;end;end loop;if not Found then return Error_Result(Op,"VALIDATION","unknown action",E);end if;end;
      elsif Op = "attribute-xp.add" or else Op = "attribute-xp.clear" or else Op="attribute.levelup" then
         declare Attrs:constant JSON_Array:=Get(Get(E,"talent"),"attributes");Name:constant String:=Str_Field(B,"attribute");Found:Boolean:=False;begin for I in 1..Length(Attrs) loop declare A:constant JSON_Value:=Get(Attrs,I);X:constant JSON_Value:=Get(A,"experience");begin if Str_Field(A,"name")=Name then Found:=True;if Op="attribute-xp.clear" then Set_Field(X,"points",Integer'(0));elsif Op="attribute-xp.add" then Requested:=Int_Field(B,"delta");Core_Clamp_Add(Natural(Int_Field(X,"points")),Natural(Int_Field(X,"max")),Natural'Max(0,Requested),New_Value,Applied);Set_Field(X,"points",Integer(New_Value));Effective:=Integer(Applied);else declare Acts:constant JSON_Array:=Get(A,"actions");begin for J in 1..Length(Acts) loop declare Z:constant JSON_Value:=Get(Acts,J);begin if Str_Field(Z,"name")=Str_Field(B,"action") then Set_Field(Z,"rating",Integer'Min(Int_Field(Z,"maxRating"),Int_Field(Z,"rating")+1));end if;end;end loop;Set_Field(X,"points",Integer'(0));end;end if;end if;end;end loop;if not Found then return Error_Result(Op,"VALIDATION","unknown attribute",E);end if;end;
      elsif Op="ability.take" then declare P:constant JSON_Value:=(if Kind="character" then Get(E,"playbook") else E);Field:constant String:=(if Kind="character" then "abilities" else "specialAbilities");A:constant JSON_Array:=Get(P,Field);O:JSON_Array:=A;Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;begin for I in 1..Length(A) loop if Str_Field(Get(A,I),"name")=Name then Set_Field(Get(A,I),"timesTaken",Int_Field(Get(A,I),"timesTaken")+1);Found:=True;end if;end loop;if not Found then declare X:JSON_Value:=Create_Object;begin Set_Field(X,"name",Name);if Kind="character" then Set_Field(X,"description","");end if;Set_Field(X,"timesTaken",Integer'(1));Append(O,X);Set_Field(P,Field,O);end;end if;end;
      elsif Op="fund.gain" or else Op="fund.spend" then declare F:constant JSON_Value:=Get(E,"fund");S:constant JSON_Value:=Get(F,"satchel");Z:constant JSON_Value:=Get(F,"stash");Req:constant Integer:=Int_Field(B,"coins");A1,A2:Integer:=0;begin Requested:=Req;if Op="fund.gain" then A1:=Integer'Min(Req,Int_Field(S,"max")-Int_Field(S,"coins"));Set_Field(S,"coins",Int_Field(S,"coins")+A1);A2:=Integer'Min(Req-A1,Int_Field(Z,"max")-Int_Field(Z,"coins"));Set_Field(Z,"coins",Int_Field(Z,"coins")+A2);Effective:=A1+A2;return Success_Result(Op,E,Requested,Effective,Side=>(if Effective<Requested then Trim_Image(Requested-Effective)&" coin could not be stored" else ""));else Effective:=Integer'Min(Req,Int_Field(S,"coins"));Set_Field(S,"coins",Int_Field(S,"coins")-Effective);return Success_Result(Op,E,Requested,Effective);end if;end;
      elsif Op="rolodex.add" then declare R:constant JSON_Value:=Get(E,"rolodex");A:constant JSON_Array:=Get(R,"friends");O:JSON_Array:=A;X:JSON_Value:=Create_Object;begin Set_Field(X,"entry",Str_Field(B,"entry"));Set_Field(X,"closeness","friend");Append(O,X);Set_Field(R,"friends",O);end;
      elsif Op="rolodex.set-closeness" then declare A:constant JSON_Array:=Get(Get(E,"rolodex"),"friends");begin for I in 1..Length(A) loop if Str_Field(Get(A,I),"entry")=Str_Field(B,"entry") then Set_Field(Get(A,I),"closeness",Str_Field(B,"closeness","friend"));end if;end loop;end;
      elsif Op="dossier.update" then declare D:constant JSON_Value:=Get(E,"dossier");procedure Copy(Name:UTF8_String;Value:JSON_Value)is begin if Has_Field(D,Name) then Set_Field(D,Name,Clone(Value));end if;end;begin if Str_Field(B,"crewId")/="" and then Read_Entity("crew",Str_Field(B,"crewId")).Kind/=JSON_Object_Type then return Error_Result(Op,"VALIDATION","unknown crew",E);end if;Map_JSON_Object(B,Copy'Access);end;
      elsif Op = "heat.add" or else Op = "wanted.add" or else Op = "rep.add" then
         declare Name : constant String := (if Op="heat.add" then "heat" elsif Op="wanted.add" then "wanted" else "rep"); begin
            Target:=Get(E,Name);Requested:=Int_Field(B,"delta");
            if Requested >= 0 then Core_Clamp_Add(Natural(Int_Field(Target,"current")),Natural(Int_Field(Target,"max")),Natural(Requested),New_Value,Applied);
            else Core_Clamp_Subtract(Natural(Int_Field(Target,"current")),Natural(Int_Field(Target,"max")),Natural(-Requested),New_Value,Applied); end if;
            Set_Field(Target,"current",Integer(New_Value));Effective:=(if Requested >= 0 then Integer(Applied) else -Integer(Applied));return Success_Result(Op,E,Requested,Effective);
         end;
      elsif Op = "clock.progress" then
         Requested:=Int_Field(B,"segments");Core_Clamp_Add(Natural(Int_Field(E,"segments")),Natural(Int_Field(E,"size")),Natural'Max(0,Requested),New_Value,Applied);
         Set_Field(E,"segments",Integer(New_Value));return Success_Result(Op,E);
      elsif Op = "clock.reset" then Set_Field(E,"segments",Integer'(0));Set_Field(E,"rollover",Integer'(0));
      elsif Op = "gear.lock" then declare X : constant JSON_Value := Get(E,"gear"); begin Set_Field(X,"isCommitmentLocked",True); end;
      elsif Op = "gear.unlock" then declare X : constant JSON_Value := Get(E,"gear"); begin Set_Field(X,"isCommitmentLocked",False); end;
      elsif Op = "gear.set-commitment" then
         if Bool_Field(Get(E,"gear"),"isCommitmentLocked") then return Error_Result(Op,"COMMITMENT_LOCKED","commitment is locked",E); end if;
         declare X : constant JSON_Value := Get(E,"gear"); begin Set_Field(X,"commitment",Str_Field(B,"commitment")); end;
      elsif Op = "notebook.set" then Set_Field(E,"notebook",Str_Field(B,"text"));
      elsif Op = "hold.set" then Set_Field(E,"hold",Str_Field(B,"hold","weak"));
      elsif Op="upgrade.mark" or else Op="upgrade.unmark" then declare A:constant JSON_Array:=Get(E,"upgrades");O:JSON_Array:=Empty_Array;Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;begin for I in 1..Length(A) loop declare X:constant JSON_Value:=Get(A,I);begin if Str_Field(X,"name")=Name then Found:=True;declare N:constant Integer:=Int_Field(X,"boxesMarked")+(if Op="upgrade.mark" then 1 else -1);begin if N>0 then Set_Field(X,"boxesMarked",N);Append(O,X);end if;end;else Append(O,X);end if;end;end loop;if Op="upgrade.mark" and then not Found then declare X:JSON_Value:=Create_Object;begin Set_Field(X,"name",Name);Set_Field(X,"boxesMarked",Integer'(1));Append(O,X);end;end if;Set_Field(E,"upgrades",O);end;
      elsif Op = "fields.update" then
         declare procedure Copy_Field (Name : UTF8_String; Value : JSON_Value) is begin if Has_Field(E,Name) then Set_Field(E,Name,Clone(Value)); end if; end; begin Map_JSON_Object(B,Copy_Field'Access); end;
      else return Error_Result (Op,"VALIDATION","unknown operation",E);
      end if;
      return Success_Result (Op,E,Requested,Effective);
   exception when Constraint_Error => return Error_Result(Op,"VALIDATION","invalid operation arguments",E);
   end Mutate;

   function Handle_Games (Path : String) return AWS.Response.Data is
      P2 : constant String := Part(Path,3); P3 : constant String := Part(Path,4); P4 : constant String := Part(Path,5);
      G : JSON_Value;
   begin
      if P2 = "" then
         G:=Read(Read_File(To_String(Games_Root)&"/games.json"));
         declare A:constant JSON_Array:=Get(G);O:JSON_Array:=Empty_Array;begin for I in 1..Length(A) loop declare X:JSON_Value:=Create_Object;V:constant JSON_Value:=Get(A,I);begin Set_Field(X,"name",Str_Field(V,"Name"));Set_Field(X,"stem",Str_Field(V,"Stem"));Set_Field(X,"language",Str_Field(V,"Language"));Append(O,X);end;end loop;return Json_Response(Create(O));end;
      end if;
      G:=Game(P2);if G.Kind/=JSON_Object_Type then return Fail(AWS.Messages.S404,"games.get","NOT_FOUND");end if;
      if P3="" then return Json_Response(G);
      elsif P3="playbooks" then
         declare A:constant JSON_Array:=Get(G,"Playbooks");begin if P4="" then return Json_Response(Create(A));end if;for I in 1..Length(A) loop if Str_Field(Get(A,I),"Name")=P4 then return Json_Response(Get(A,I));end if;end loop;return Fail(AWS.Messages.S404,"games.playbook","NOT_FOUND");end;
      elsif P3="heritages" then return Json_Response(Get(G,"Heritages"));
      elsif P3="crews" then
         declare N:constant String:=To_String(Games_Root)&"/"&P2&"-crews.json";V:JSON_Value;begin if not Ada.Directories.Exists(N) then return Fail(AWS.Messages.S404,"games.crews","NOT_FOUND");end if;V:=Read(Read_File(N));if P4="" then return Json_Response(V);end if;return Fail(AWS.Messages.S404,"games.crew","NOT_FOUND");end;
      end if;
      return Fail(AWS.Messages.S404,"games.get","NOT_FOUND");
   end Handle_Games;

   function Handle_Entity (Request : AWS.Status.Data; Path : String) return AWS.Response.Data is
      Plural : constant String:=Part(Path,2);Kind:constant String:=(if Plural="characters" then "character" elsif Plural="crews" then "crew" else "clock");
      Id:constant String:=Part(Path,3);Suffix:constant String:=Part(Path,4)&(if Part(Path,5)/="" then "/"&Part(Path,5) else "");
      Is_Post:constant Boolean:=AWS.Status.Method(Request)=AWS.Status.POST;B,E,R:JSON_Value;
   begin
      if Id="" then
         if not Is_Post then return Json_Response(Create(All_Entities(Kind)));end if;
         B:=Parse_Body(Request);
         if Kind="character" then if Game(Str_Field(B,"gameStem")).Kind/=JSON_Object_Type then return Fail(AWS.Messages.S400,"character.create","VALIDATION");end if;E:=New_Character(Str_Field(B,"gameStem"),Str_Field(B,"playbook"));
         elsif Kind="crew" then if Game(Str_Field(B,"gameStem")).Kind/=JSON_Object_Type then return Fail(AWS.Messages.S400,"crew.create","VALIDATION");end if;E:=New_Crew(Str_Field(B,"gameStem"),Str_Field(B,"crewType"));
         else E:=New_Clock(B);end if;
         Write_Entity(Kind,Str_Field(E,"id"),E);return Json_Response(Success_Result(Kind&".create",E));
      end if;
      if not Safe(Id) then return Fail(AWS.Messages.S404,"get","NOT_FOUND");end if;
      E:=Read_Entity(Kind,Id);if E.Kind/=JSON_Object_Type then return Fail(AWS.Messages.S404,"get","NOT_FOUND");end if;
      if Suffix="" then declare X:AWS.Response.Data:=Json_Text(Read_File(Current_File(Kind,Id)));begin if AWS.Status.Parameter(Request,"download")="1" then AWS.Response.Set.Add_Header(X,"Content-Disposition","attachment; filename="""&Id&".json""");end if;return X;end;end if;
      if Suffix="history" then return Json_Response(Create(History(Kind,Id)));end if;
      if not Is_Post then return Fail(AWS.Messages.S404,"request","NOT_FOUND");end if;
      B:=Parse_Body(Request);
      if Header(Request,"Idempotency-Key")/="" and then Header(Request,"Idempotency-Key")=To_String(Last_Idempotency_Key) then return Json_Text(To_String(Last_Idempotency_Response));end if;
      if Header(Request,"If-Match")/="" and then Header(Request,"If-Match")/=Trim_Image(Int_Field(E,"revision")) then return Fail(AWS.Messages.S409,Suffix,"STALE_REVISION",E,"current revision is "&Trim_Image(Int_Field(E,"revision")));end if;
      if Header(Request,"If-Match")/="" then declare Granted:Boolean;begin Revision_Gate.Claim(Id,Int_Field(E,"revision"),Granted);if not Granted then return Fail(AWS.Messages.S409,Suffix,"STALE_REVISION",E,"current revision is "&Trim_Image(Int_Field(E,"revision")+1));end if;end;end if;
      if Suffix="delete" then if not Bool_Field(B,"confirm") then return Json_Response(Error_Result("delete","CONFIRM_REQUIRED","confirm must be true",E));end if;if Kind="crew" then declare A:constant JSON_Array:=All_Entities("character");begin for I in 1..Length(A) loop declare C:constant JSON_Value:=Get(A,I);D:constant JSON_Value:=Get(C,"dossier");begin if Str_Field(D,"crewId")=Id then Set_Field(D,"crewId","");Stamp(C);Write_Entity("character",Str_Field(C,"id"),C);end if;end;end loop;end;end if;Ada.Directories.Delete_Tree(Entity_Dir(Kind,Id));return Json_Response(Success_Result("delete",E));end if;
      if Suffix="undo" then declare Base:constant String:=Entity_Dir(Kind,Id)&"/history";Search:Ada.Directories.Search_Type;Ent:Ada.Directories.Directory_Entry_Type;Name:Unbounded_String;begin if Ada.Directories.Exists(Base) then Ada.Directories.Start_Search(Search,Base,"*.json",(Ada.Directories.Ordinary_File=>True,others=>False));while Ada.Directories.More_Entries(Search) loop Ada.Directories.Get_Next_Entry(Search,Ent);Name:=To_Unbounded_String(Ada.Directories.Full_Name(Ent));end loop;Ada.Directories.End_Search(Search);end if;if Length(Name)=0 then return Json_Response(Error_Result("undo","NO_HISTORY","no history",E));end if;declare V:constant JSON_Value:=Read(Read_File(To_String(Name)));Restored:constant JSON_Value:=Get(V,"entity");begin Set_Field(Restored,"revision",Int_Field(E,"revision")+1);Set_Field(Restored,"updatedAt",Now);Write_Entity(Kind,Id,Restored);Ada.Directories.Delete_File(To_String(Name));return Json_Response(Success_Result("undo",Restored));end;end;end if;
      if Suffix="import" then if Str_Field(B,"kind")/=Kind or else Str_Field(B,"id")/=Id then return Fail(AWS.Messages.S400,"import","VALIDATION",E,"kind/id mismatch");end if;Set_Field(B,"revision",Int_Field(E,"revision")+1);Set_Field(B,"updatedAt",Now);Write_Entity(Kind,Id,B);return Json_Response(Success_Result("import",B));end if;
      declare Op:constant String:=(if Suffix'Length>4 and then Suffix(Suffix'First..Suffix'First+3)="ops/" then Suffix(Suffix'First+4..Suffix'Last) else Suffix);X:AWS.Response.Data;Before:constant JSON_Value:=Clone(E);begin R:=Mutate(Kind,Op,E,B);if Bool_Field(R,"ok") then Snapshot(Kind,Id,Op,Before);Stamp(E);Write_Entity(Kind,Id,E);Set_Field(R,Kind,E);end if;X:=Json_Response(R);if Header(Request,"Idempotency-Key")/="" then Last_Idempotency_Key:=To_Unbounded_String(Header(Request,"Idempotency-Key"));Last_Idempotency_Response:=To_Unbounded_String(String'(Write(R,Compact=>False))&ASCII.LF);end if;return X;end;
   exception when Constraint_Error => return Fail(AWS.Messages.S413,"import","VALIDATION",Message=>"request exceeds 1 MiB");
   end Handle_Entity;

   procedure Configure (Static_Directory, Data_Directory, Games_Directory : String; Test_Hooks : Boolean) is
      Campaign : JSON_Value;
   begin
      Static_Root:=To_Unbounded_String(Static_Directory);Data_Root:=To_Unbounded_String(Data_Directory);Games_Root:=To_Unbounded_String(Games_Directory);Hooks:=Test_Hooks;
      if not Ada.Directories.Exists(Data_Directory) then Ada.Directories.Create_Path(Data_Directory);end if;
      if not Ada.Directories.Exists(Data_Directory&"/campaign.json") then Campaign:=Create_Object;Set_Field(Campaign,"name","Paperclips Campaign");Set_Field(Campaign,"gameStem","blades-in-the-dark");Set_Field(Campaign,"createdAt",Now);Set_Field(Campaign,"formatVersion",Integer'(1));Atomic_Write(Data_Directory&"/campaign.json",Campaign);end if;
   end Configure;

   function Handle (Request : AWS.Status.Data) return AWS.Response.Data is
      URI:constant String:=AWS.Status.URI(Request);Path:constant String:=Path_Only(URI);Response:AWS.Response.Data;
   begin
      if Path="/api/health" then declare V:JSON_Value:=Create_Object;begin Set_Field(V,"status","ok");Set_Field(V,"implementation","ada");Set_Field(V,"version","0.2.0");Set_Field(V,"dataDir",To_String(Data_Root));Response:=Json_Response(V);end;
      elsif Path="/api/campaign" then Response:=Json_Text(Read_File(To_String(Data_Root)&"/campaign.json"));
      elsif Path="/api/campaign/batch" then Response:=Json_Response(Error_Result("batch","VALIDATION","ops must be a non-empty array"));
      elsif Path="/api/campaign/roster" then
         declare CA:constant JSON_Array:=All_Entities("character");CR:constant JSON_Array:=All_Entities("crew");CO:JSON_Array:=Empty_Array;RO:JSON_Array:=Empty_Array;V:JSON_Value:=Create_Object;begin
            for I in 1..Length(CA) loop declare C:constant JSON_Value:=Get(CA,I);D:constant JSON_Value:=Get(C,"dossier");M:constant JSON_Value:=Get(C,"monitor");X:JSON_Value:=Create_Object;T:constant JSON_Value:=Get(Get(M,"trauma"),"traumas");begin Set_Field(X,"id",Str_Field(C,"id"));Set_Field(X,"name",Str_Field(D,"name"));Set_Field(X,"alias",Str_Field(D,"alias"));Set_Field(X,"playbook",Str_Field(Get(C,"playbook"),"name"));Set_Field(X,"gameStem",Str_Field(C,"gameStem"));Set_Field(X,"crewId",Str_Field(D,"crewId"));Set_Field(X,"stress",Int_Field(Get(M,"stress"),"current"));Set_Field(X,"traumas",T);Set_Field(X,"isRetired",Bool_Field(C,"isRetired"));Set_Field(X,"isDeadish",Bool_Field(C,"isDeadish"));Set_Field(X,"revision",Int_Field(C,"revision"));Append(CO,X);end;end loop;
            for I in 1..Length(CR) loop declare C:constant JSON_Value:=Get(CR,I);X:JSON_Value:=Create_Object;Members:Natural:=0;begin for J in 1..Length(CA) loop if Str_Field(Get(Get(CA,J),"dossier"),"crewId")=Str_Field(C,"id") then Members:=Members+1;end if;end loop;Set_Field(X,"id",Str_Field(C,"id"));Set_Field(X,"name",Str_Field(C,"name"));Set_Field(X,"crewType",Str_Field(C,"crewTypeName"));Set_Field(X,"gameStem",Str_Field(C,"gameStem"));Set_Field(X,"tier",Int_Field(C,"tier"));Set_Field(X,"heat",Int_Field(Get(C,"heat"),"current"));Set_Field(X,"wanted",Int_Field(Get(C,"wanted"),"current"));Set_Field(X,"rep",Int_Field(Get(C,"rep"),"current"));Set_Field(X,"hold",Str_Field(C,"hold"));Set_Field(X,"memberCount",Integer(Members));Set_Field(X,"revision",Int_Field(C,"revision"));Append(RO,X);end;end loop;Set_Field(V,"characters",CO);Set_Field(V,"crews",RO);Response:=Json_Response(V);
         end;
      elsif Part(Path,1)="api" and then Part(Path,2)="games" then Response:=Handle_Games(Path);
      elsif Part(Path,1)="api" and then (Part(Path,2)="characters" or else Part(Path,2)="crews" or else Part(Path,2)="clocks") then Response:=Handle_Entity(Request,Path);
      elsif Path="/api/test-hooks/crash-mid-write" then Response:=AWS.Response.Build(AWS.MIME.Text_Plain,"",AWS.Messages.S501);
      elsif Path'Length>=5 and then Path(Path'First..Path'First+4)="/api/" then Response:=Fail(AWS.Messages.S404,"request","NOT_FOUND");
      elsif AWS.Status.Method(Request)=AWS.Status.GET or else AWS.Status.Method(Request)=AWS.Status.HEAD then
         declare N:constant String:=To_String(Static_Root)&(if Path="/" then "/index.html" else Path);begin if Path'Length>1 and then Ada.Strings.Fixed.Index(Path,"..")/=0 then Response:=AWS.Response.Acknowledge(AWS.Messages.S404,"Not found",AWS.MIME.Text_Plain);elsif Ada.Directories.Exists(N) and then Ada.Directories.Kind(N)=Ada.Directories.Ordinary_File then Response:=AWS.Response.File(AWS.MIME.Content_Type(N),N);else Response:=AWS.Response.Acknowledge(AWS.Messages.S404,"Not found",AWS.MIME.Text_Plain);end if;end;
      else Response:=AWS.Response.Acknowledge(AWS.Messages.S405,"Method not allowed",AWS.MIME.Text_Plain);end if;
      Ada.Text_IO.Put_Line("{""method"":"""&AWS.Status.Method(Request)&""",""path"":"""&Path&""",""status"":"&AWS.Messages.Image(AWS.Response.Status_Code(Response))&"}");return Response;
   exception when E:others => Ada.Text_IO.Put_Line(Ada.Exceptions.Exception_Information(E));return Fail(AWS.Messages.S400,"request","VALIDATION",Message=>Ada.Exceptions.Exception_Message(E));
   end Handle;
end Pitd_Callback;
