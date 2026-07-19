with Ada.Command_Line;
with Ada.Strings.Unbounded;
with AWS.Server;
with Pitd_Callback;

procedure Pitd is
   use Ada.Command_Line;
   use Ada.Strings.Unbounded;

   Server     : AWS.Server.HTTP;
   Port       : Positive := 9_657;
   Data_Dir   : Unbounded_String := To_Unbounded_String ("./campaign-data");
   Static_Dir : Unbounded_String := To_Unbounded_String ("./frontend/dist");
   Games_Dir  : Unbounded_String := To_Unbounded_String ("./data/games");
   Test_Hooks : Boolean := False;
   Position   : Positive := 1;
begin
   while Position <= Argument_Count loop
      if Argument (Position) = "--port" and then Position < Argument_Count then
         Position := Position + 1;
         Port := Positive'Value (Argument (Position));
      elsif Argument (Position) = "--data" and then Position < Argument_Count then
         Position := Position + 1;
         Data_Dir := To_Unbounded_String (Argument (Position));
      elsif Argument (Position) = "--static" and then Position < Argument_Count then
         Position := Position + 1;
         Static_Dir := To_Unbounded_String (Argument (Position));
      elsif Argument (Position) = "--games" and then Position < Argument_Count then
         Position := Position + 1;
         Games_Dir := To_Unbounded_String (Argument (Position));
      elsif Argument (Position) = "--test-hooks" then
         Test_Hooks := True;
      end if;
      Position := Position + 1;
   end loop;

   Pitd_Callback.Configure
     (To_String (Static_Dir), To_String (Data_Dir), To_String (Games_Dir),
      Test_Hooks);
   AWS.Server.Start
     (Server, "Paperclips in the Dark (Ada)", Pitd_Callback.Handle'Access,
      Port => Port);
   AWS.Server.Wait (AWS.Server.Forever);
end Pitd;
