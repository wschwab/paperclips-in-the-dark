with Ada.Command_Line;
with Ada.Directories;
with Ada.Strings.Unbounded;
with AWS.Server;
with Pitd_Callback;

procedure Pitd is
   use Ada.Command_Line;
   use Ada.Strings.Unbounded;

   Server     : AWS.Server.HTTP;
   Port       : Positive := 9_657;
   Data_Dir   : Unbounded_String;
   Static_Dir : Unbounded_String;
   Games_Dir  : Unbounded_String;
   Test_Hooks : Boolean := False;
   Position   : Positive := 1;
   Data_Explicit   : Boolean := False;
   Static_Explicit : Boolean := False;
   Games_Explicit  : Boolean := False;

   function Executable_Directory return String is
      Exe_Path : constant String := Ada.Directories.Full_Name (Command_Name);
      Exe_Dir  : constant String := Ada.Directories.Containing_Directory (Exe_Path);
   begin
      return Exe_Dir;
   end Executable_Directory;

   Repo_Root : constant String :=
     Ada.Directories.Containing_Directory (
       Ada.Directories.Containing_Directory (
         Ada.Directories.Containing_Directory (Executable_Directory)));

   function Default_Data_Dir return String is
   begin
      return Repo_Root & "/campaign-data";
   end Default_Data_Dir;

   function Default_Static_Dir return String is
   begin
      return Repo_Root & "/frontend/dist";
   end Default_Static_Dir;

   function Default_Games_Dir return String is
   begin
      return Repo_Root & "/data/games";
   end Default_Games_Dir;

begin
   while Position <= Argument_Count loop
      if Argument (Position) = "--port" and then Position < Argument_Count then
         Position := Position + 1;
         Port := Positive'Value (Argument (Position));
      elsif Argument (Position) = "--data" and then Position < Argument_Count then
         Position := Position + 1;
         Data_Dir := To_Unbounded_String (Argument (Position));
         Data_Explicit := True;
      elsif Argument (Position) = "--static" and then Position < Argument_Count then
         Position := Position + 1;
         Static_Dir := To_Unbounded_String (Argument (Position));
         Static_Explicit := True;
      elsif Argument (Position) = "--games" and then Position < Argument_Count then
         Position := Position + 1;
         Games_Dir := To_Unbounded_String (Argument (Position));
         Games_Explicit := True;
      elsif Argument (Position) = "--test-hooks" then
         Test_Hooks := True;
      end if;
      Position := Position + 1;
   end loop;

   if not Data_Explicit then
      Data_Dir := To_Unbounded_String (Default_Data_Dir);
   end if;
   if not Static_Explicit then
      Static_Dir := To_Unbounded_String (Default_Static_Dir);
   end if;
   if not Games_Explicit then
      Games_Dir := To_Unbounded_String (Default_Games_Dir);
   end if;

   Pitd_Callback.Configure
     (To_String (Static_Dir), To_String (Data_Dir), To_String (Games_Dir),
      Test_Hooks);
   AWS.Server.Start
     (Server, "Paperclips in the Dark (Ada)", Pitd_Callback.Handle'Access,
      Port => Port);
   AWS.Server.Wait (AWS.Server.Forever);
end Pitd;
