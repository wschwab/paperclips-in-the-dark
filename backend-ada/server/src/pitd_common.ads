--  ARCH-01 rev 1: shared primitives, entity storage, history metadata, the
--  game-settings cache, game-derived domain helpers, and the operation-result
--  envelope.  Extracted verbatim from pitd_callback.adb (finding AR-014);
--  no behavioral change.  Every other extraction (Pitd_Stored, Pitd_Normalize,
--  Pitd_Summary, Pitd_Capability, Pitd_Ops) builds on this package; nothing
--  here depends on any of them.
with Ada.Calendar;
with Ada.Calendar.Formatting;
with Ada.Directories;
with Ada.Strings.Fixed;
with Ada.Strings.Unbounded;
with Ada.Text_IO;
with AWS.Utils;
with GNAT.OS_Lib;
with GNAT.SHA256;
with GNATCOLL.JSON;
with Interfaces.C;
with Pitd_Error;

package Pitd_Common is
   pragma SPARK_Mode (Off);

   use Ada.Strings.Unbounded;
   use GNATCOLL.JSON;

   --  Server data locations (set by the server's Configure; shared by the
   --  storage helpers here and by the HTTP glue).
   Data_Root  : Unbounded_String := To_Unbounded_String ("./campaign-data");
   Games_Root : Unbounded_String := To_Unbounded_String ("./data/games");

   --  Shared limits (frozen capability/service values).
   Max_Import  : constant := 1_024 * 1_024;
   Max_History_Snapshots : constant := 50;

   --  JSON field accessors (lenient: wrong kind or missing field -> default).
   function Str_Field (V : JSON_Value; Name : String; Default : String := "") return String;
   function Int_Field (V : JSON_Value; Name : String; Default : Integer := 0) return Integer;
   function Bool_Field (V : JSON_Value; Name : String; Default : Boolean := False) return Boolean;
   function Array_Length (V : JSON_Value; Name : String) return Natural;
   function Obj_Field (V : JSON_Value; Name : String) return JSON_Value;
   function Empty_List return JSON_Value;

   type Level_Array is array (Positive range <>) of Unbounded_String;

   --  Scalar / time / id utilities.
   function Trim_Image (N : Integer) return String;
   function Safe (Value : String) return Boolean;
   function Now return String;
   function New_Id return String;
   function Digits17 (N : Long_Long_Integer) return String;
   function New_Snapshot_Id return String;
   function Content_Token (Bytes : String) return String;

   --  Entity storage (atomic current.json writes, directory enumeration).
   function Read_File (Name : String) return String;
   procedure Atomic_Write (Name : String; Value : JSON_Value);
   function Entity_Dir (Kind, Id : String) return String;
   function Current_File (Kind, Id : String) return String;
   function Read_Entity (Kind, Id : String) return JSON_Value;
   procedure Try_Read_Entity
     (Kind, Id : String; V : out JSON_Value;
      Exists, Parse_Ok : out Boolean);
   procedure Write_Entity (Kind, Id : String; Entity : JSON_Value);
   function Entity_Ids (Kind : String) return JSON_Array;

   --  SC-A2: --test-hooks crash probe (REPAIR-ATOMIC-004); armed by the
   --  test-hooks route, fired inside Atomic_Write.
   procedure Crash_Arm (Entity_Id : String);
   procedure Crash_Check (Target : String; Crash : out Boolean);

   --  History metadata — the ONE canonical path for snapshot creation,
   --  listing, retention, and the derived counts.  Summaries and routes
   --  must both go through these (no summary computes its own).
   procedure Prune_History (Kind, Id : String);
   procedure Snapshot (Kind, Id, Op : String; Entity : JSON_Value);
   Baseline_Snapshot_Name : constant String := "00000000000000000-baseline.json";
   function Is_Baseline_Snapshot (Name : String) return Boolean;
   procedure Write_Baseline_Snapshot (Kind, Id, Op : String; Entity : JSON_Value);
   procedure Rebuild_Index (Kind, Id : String);
   function History_Count (Kind, Id : String) return Natural;
   function History (Kind, Id : String) return JSON_Array;

   --  SC-A5: registers one validated settings entry (called by the glue's
   --  Load_One_Game).  False when the cache is full.
   function Cache_Game (Stem : String; Settings : JSON_Value) return Boolean;
   function Game (Stem : String) return JSON_Value;
   type Settings_Ref is record
      Stem : Unbounded_String := Null_Unbounded_String;
      G    : JSON_Value := JSON_Null;
   end record;
   function Settings_Int (S : Settings_Ref; Key : String; Fallback : Integer) return Integer;

   --  Game-derived domain helpers (no game-domain literals at call sites).
   function Can_Take_More (Kind, Name : String; E : JSON_Value; Times_Taken : Integer) return Boolean;
   function Ability_Take_Limit (Kind, Name : String; E : JSON_Value) return Integer;
   function Upgrade_Total_Boxes (E : JSON_Value; Name : String) return Integer;
   function Crew_Stash_Capacity (E : JSON_Value) return Integer;
   function Armor_Available (E : JSON_Value; Which : String) return Boolean;
   function Ability_Description (Kind, Name : String; E : JSON_Value) return String;
   procedure Mastery_State (E : JSON_Value; Total, Marked : out Integer);
   function Rating_Cap (E : JSON_Value) return Integer;

   --  Operation-result envelope (typed whole-error union + success shape).
   function Root_Issues (Message : String) return JSON_Array;
   function Error_Result
     (Op, Code, Message : String; Entity : JSON_Value := JSON_Null)
      return JSON_Value;
   function Success_Result
     (Op : String; Entity : JSON_Value; Requested : Integer := Integer'First;
      Effective : Integer := Integer'First; Landed : String := "";
      Side : String := "") return JSON_Value;
end Pitd_Common;
