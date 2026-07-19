with Ada.Command_Line;
with Ada.Directories;
with Ada.Exceptions;
with Ada.Text_IO;
with Ada.Strings.Unbounded;

with AWS.Server;

with Pitd_Callback;

procedure Pitd is

   use Ada.Command_Line;
   use Ada.Strings.Unbounded;

   Default_Static_Directory : constant String := "./frontend/dist";
   Default_Data_Directory   : constant String := "./campaign-data";
   Default_Port             : constant Natural := 9657;

   Static_Directory : Unbounded_String :=
     To_Unbounded_String (Default_Static_Directory);
   Data_Directory : Unbounded_String :=
     To_Unbounded_String (Default_Data_Directory);
   Port : Natural := Default_Port;
   Server : AWS.Server.HTTP;

   procedure Usage is
   begin
      Ada.Text_IO.Put_Line
        ("Usage: pitd [--static <dir>] [--port <port>] [--data <dir>]");
   end Usage;

   function Next_Value
     (Option   : String;
      Position : in out Positive) return String
   is
   begin
      if Position = Argument_Count then
         raise Constraint_Error with Option & " requires a value";
      end if;
      Position := Position + 1;
      return Argument (Position);
   end Next_Value;

begin
   declare
      Position : Positive := 1;
   begin
      while Position <= Argument_Count loop
         declare
            Option : constant String := Argument (Position);
         begin
            if Option = "--static" then
               Static_Directory :=
                 To_Unbounded_String (Next_Value (Option, Position));
            elsif Option = "--data" then
               Data_Directory :=
                 To_Unbounded_String (Next_Value (Option, Position));
            elsif Option = "--port" then
               Port := Natural'Value (Next_Value (Option, Position));
            elsif Option = "--help" or else Option = "-h" then
               Usage;
               return;
            else
               raise Constraint_Error with "unknown option: " & Option;
            end if;
         end;
         Position := Position + 1;
      end loop;
   end;

   declare
      Full_Static_Directory : constant String :=
        Ada.Directories.Full_Name (To_String (Static_Directory));
      Full_Data_Directory : constant String :=
        Ada.Directories.Full_Name (To_String (Data_Directory));
   begin
      Pitd_Callback.Configure (Full_Static_Directory, Full_Data_Directory);
   end;

   AWS.Server.Start
     (Server,
      Name           => "Paperclips in the Dark Ada server",
      Port           => Port,
      Max_Connection => 32,
      Callback       => Pitd_Callback.Handle'Access);
   AWS.Server.Wait (AWS.Server.Forever);
   AWS.Server.Shutdown (Server);
exception
   when Error : Constraint_Error =>
      Ada.Text_IO.Put_Line (Ada.Exceptions.Exception_Message (Error));
      Usage;
      Set_Exit_Status (Failure);
   when others =>
      AWS.Server.Shutdown (Server);
      raise;
end Pitd;
