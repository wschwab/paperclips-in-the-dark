pragma SPARK_Mode (On);

package Paperclips_Core.Gear is
   type Commitment_Kind is (None, Light, Normal, Heavy, Encumbered);
   type Armor_Kind is (Standard, Heavy_Armor, Special);
   type Armor_Availability is array (Armor_Kind) of Boolean;
   type Armor_Usage is array (Armor_Kind) of Boolean;

   type Gear_State (Bulk_Limit : Capacity) is record
      Commitment       : Commitment_Kind := None;
      Committed_Bulk   : Natural := 0;
      Is_Locked        : Boolean := False;
      Armor_Available  : Armor_Availability := (others => False);
      Armor_Used       : Armor_Usage := (others => False);
   end record
   with Dynamic_Predicate => Gear_State.Committed_Bulk <= Gear_State.Bulk_Limit;

   procedure Set_Commitment
     (Item : in out Gear_State; Kind : Commitment_Kind;
      Maximum_Bulk : Natural; Error : out Operation_Error)
   with Pre => Maximum_Bulk <= Item.Bulk_Limit,
        Post => (if Item'Old.Is_Locked then Error = Commitment_Locked
                 else Error = No_Error and Item.Commitment = Kind);

   procedure Commit
     (Item : in out Gear_State; Bulk : Natural; Error : out Operation_Error)
   with Post =>
     (if Item'Old.Is_Locked then Error = Commitment_Locked
      elsif Item'Old.Commitment = None then Error = No_Commitment
      elsif Bulk > Item.Bulk_Limit - Item'Old.Committed_Bulk then Error = Over_Bulk
      else Error = No_Error
       and Item.Committed_Bulk = Item'Old.Committed_Bulk + Bulk);

   procedure Clear_Commitments
     (Item : in out Gear_State; Error : out Operation_Error)
   with Post =>
     (if Item'Old.Is_Locked then Error = Commitment_Locked
      else Error = No_Error and Item.Commitment = None
       and Item.Committed_Bulk = 0
       and Item.Armor_Available = Armor_Availability'(others => False));

   procedure Set_Lock (Item : in out Gear_State; Locked : Boolean)
     with Post => Item.Is_Locked = Locked;

   procedure Set_Armor_Available
     (Item : in out Gear_State; Kind : Armor_Kind; Available : Boolean)
   with Post => Item.Armor_Available (Kind) = Available;

   procedure Set_Armor_Used
     (Item : in out Gear_State; Kind : Armor_Kind; Used : Boolean;
      Error : out Operation_Error)
   with Post =>
     (if Used and not Item'Old.Armor_Available (Kind) then
          Error = Armor_Not_Available
          and Item.Armor_Used (Kind) = Item'Old.Armor_Used (Kind)
      else Error = No_Error and Item.Armor_Used (Kind) = Used);
end Paperclips_Core.Gear;
