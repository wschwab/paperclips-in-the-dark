with Ada.Directories;
with Ada.Strings.Unbounded;
with Ada.Text_IO;

with AWS.Messages;
with AWS.MIME;
with AWS.Response;
with AWS.Status;

package body Pitd_Callback is

   use Ada.Strings.Unbounded;
   use type Ada.Directories.File_Kind;
   use type AWS.Status.Request_Method;

   Static_Directory : Unbounded_String := To_Unbounded_String ("./frontend/dist");
   Data_Directory   : Unbounded_String := To_Unbounded_String ("./campaign-data");

   function Json_Escape (Value : String) return String is
      Result : Unbounded_String;
   begin
      for Character_Value of Value loop
         case Character_Value is
            when '"' | '\' =>
               Append (Result, '\');
               Append (Result, Character_Value);
            when others =>
               Append (Result, Character_Value);
         end case;
      end loop;
      return To_String (Result);
   end Json_Escape;

   function Path_Only (URI : String) return String is
      Query_Mark : Natural := 0;
   begin
      for Position in URI'Range loop
         if URI (Position) = '?' then
            Query_Mark := Position;
            exit;
         end if;
      end loop;

      if Query_Mark = 0 then
         return URI;
      elsif Query_Mark = URI'First then
         return "/";
      else
         return URI (URI'First .. Query_Mark - 1);
      end if;
   end Path_Only;

   function Contains_Traversal (Path : String) return Boolean is
   begin
      if Path'Length < 2 then
         return False;
      end if;

      for Position in Path'First .. Path'Last - 1 loop
         if Path (Position .. Position + 1) = ".." then
            return True;
         end if;
      end loop;
      return False;
   end Contains_Traversal;

   function Not_Found return AWS.Response.Data is
   begin
      return AWS.Response.Acknowledge
        (AWS.Messages.S404, "Not found", AWS.MIME.Text_Plain);
   end Not_Found;

   function Serve_Static (Path : String) return AWS.Response.Data is
      Requested_Path : constant String := Path_Only (Path);
      File_Name      : Unbounded_String;
   begin
      if Contains_Traversal (Requested_Path) then
         return Not_Found;
      elsif Requested_Path = "/" then
         File_Name := Static_Directory & "/index.html";
      elsif Requested_Path'Length > 0
        and then Requested_Path (Requested_Path'First) = '/'
      then
         File_Name := Static_Directory & Requested_Path;
      else
         return Not_Found;
      end if;

      declare
         Full_File_Name : constant String := To_String (File_Name);
      begin
         if not Ada.Directories.Exists (Full_File_Name)
           or else Ada.Directories.Kind (Full_File_Name)
                     /= Ada.Directories.Ordinary_File
         then
            return Not_Found;
         end if;

         return AWS.Response.File
           (AWS.MIME.Content_Type (Full_File_Name), Full_File_Name);
      end;
   end Serve_Static;

   procedure Log_Request
     (Request  : AWS.Status.Data;
      Response : AWS.Response.Data)
   is
   begin
      Ada.Text_IO.Put_Line
        ("{""method"":"""
         & Json_Escape (AWS.Status.Method (Request))
         & """,""path"":"""
         & Json_Escape (Path_Only (AWS.Status.URI (Request)))
         & """,""status"":"
         & AWS.Messages.Image (AWS.Response.Status_Code (Response))
         & "}");
   end Log_Request;

   procedure Configure
     (Static_Directory : String;
      Data_Directory   : String)
   is
   begin
      Pitd_Callback.Static_Directory := To_Unbounded_String (Static_Directory);
      Pitd_Callback.Data_Directory := To_Unbounded_String (Data_Directory);
   end Configure;

   function Handle (Request : AWS.Status.Data) return AWS.Response.Data is
      URI      : constant String := Path_Only (AWS.Status.URI (Request));
      Response : AWS.Response.Data;
   begin
      if AWS.Status.Method (Request) = AWS.Status.GET
        and then URI = "/api/health"
      then
         Response := AWS.Response.Build
           (AWS.MIME.Application_JSON,
            "{""status"":""ok"",""implementation"":""ada"",""version"":""0.1.0"",""dataDir"":"""
            & Json_Escape (To_String (Data_Directory))
            & """}");
      elsif URI'Length >= 5 and then URI (URI'First .. URI'First + 4) = "/api/"
      then
         Response := Not_Found;
      elsif AWS.Status.Method (Request) = AWS.Status.GET
        or else AWS.Status.Method (Request) = AWS.Status.HEAD
      then
         Response := Serve_Static (URI);
      else
         Response := AWS.Response.Acknowledge
           (AWS.Messages.S405, "Method not allowed", AWS.MIME.Text_Plain);
      end if;

      Log_Request (Request, Response);
      return Response;
   end Handle;

end Pitd_Callback;
