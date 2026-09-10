with Ada.Command_Line;
with Ada.Exceptions;
with Ada.Strings.Unbounded;
with Ada.Text_IO;
with GNATCOLL.JSON;
with Pitd_Ops;
with Validator_Map_Interleave;

procedure Validator_Concurrency is
   use Ada.Strings.Unbounded;
   use GNATCOLL.JSON;

   protected Results is
      procedure Reject (Reason : String);
      function Rejections return Natural;
      function First_Reason return String;
   private
      Count : Natural := 0;
      First : Unbounded_String;
   end Results;

   protected body Results is
      procedure Reject (Reason : String) is
      begin
         if Count = 0 then
            First := To_Unbounded_String (Reason);
         end if;
         Count := Count + 1;
      end Reject;

      function Rejections return Natural is (Count);
      function First_Reason return String is (To_String (First));
   end Results;

   procedure Check_Valid (Kind, Op : String; Body_Value : JSON_Value) is
      Bad : Unbounded_String;
   begin
      if not Pitd_Ops.Validate_Request (Kind, Op, Body_Value, Bad) then
         Results.Reject (Op & ": " & To_String (Bad));
      end if;
   exception
      when E : others =>
         Results.Reject (Op & ": " & Ada.Exceptions.Exception_Name (E));
   end Check_Valid;

   procedure Fail is
   begin
      Ada.Text_IO.Put_Line
        ("validator concurrency: FAIL" & Natural'Image (Results.Rejections)
         & " valid requests rejected; " & Results.First_Reason);
      Ada.Command_Line.Set_Exit_Status (Ada.Command_Line.Failure);
   end Fail;
begin
   --  The two disjoint, valid schemas reproduce the captured segments/confirm
   --  overwrite. Each task owns its JSON body and diagnostic string.
   declare
      task Clock_Check;
      task Retire_Check;

      task body Clock_Check is
         B : constant JSON_Value := Create_Object;
      begin
         Set_Field (B, "segments", Integer'(1));
         Check_Valid ("clock", "clock.progress", B);
      end Clock_Check;

      task body Retire_Check is
         B : constant JSON_Value := Create_Object;
      begin
         Validator_Map_Interleave.Wait_For_First_Map;
         Set_Field (B, "confirm", True);
         Check_Valid ("character", "retire", B);
      end Retire_Check;
   begin
      null;
   end;

   if Results.Rejections /= 0 then
      Fail;
      return;
   end if;

   --  The rendezvous affects only the first pair; ordinary mapping is used
   --  for the subsequent 64-task valid-body hammer.
   declare
      task type Hammer;
      task body Hammer is
         Clock_Body : constant JSON_Value := Create_Object;
         Retire_Body : constant JSON_Value := Create_Object;
      begin
         Set_Field (Clock_Body, "segments", Integer'(1));
         Set_Field (Retire_Body, "confirm", True);
         for I in 1 .. 1_000 loop
            if I mod 2 = 0 then
               Check_Valid ("clock", "clock.progress", Clock_Body);
            else
               Check_Valid ("character", "retire", Retire_Body);
            end if;
         end loop;
      end Hammer;
      Workers : array (1 .. 64) of Hammer;
   begin
      null;
   end;

   if Results.Rejections /= 0 then
      Fail;
      return;
   end if;

   declare
      Invalid : constant JSON_Value := Create_Object;
      Bad : Unbounded_String;
   begin
      Set_Field (Invalid, "segments", Integer'(1));
      Set_Field (Invalid, "confirm", True);
      if Pitd_Ops.Validate_Request ("clock", "clock.progress", Invalid, Bad)
        or else To_String (Bad) /= "unknown field"
      then
         Results.Reject ("real unknown fields must still be rejected");
         Fail;
         return;
      end if;
   end;

   Ada.Text_IO.Put_Line
     ("validator concurrency: PASS (2 deterministic + 64000 valid checks; unknown-field rejection preserved)");
end Validator_Concurrency;
