pragma SPARK_Mode (On);

package Paperclips_Core.Monitors is
   type Harm_Intensity is (Lesser, Moderate, Severe, Fatal);
   type Harm_Counts is array (Harm_Intensity) of Natural;

   type Monitor
     (Stress_Max         : Capacity;
      Trauma_Max        : Capacity;
      Lesser_Slots      : Capacity;
      Moderate_Slots    : Capacity;
      Severe_Slots      : Capacity;
      Fatal_Slots       : Capacity;
      Healing_Clock_Max : Capacity) is private;

   function Stress (Item : Monitor) return Natural;
   function Trauma (Item : Monitor) return Natural;
   function Harms (Item : Monitor) return Harm_Counts;
   function Healing_Clock (Item : Monitor) return Natural;
   function Healing_Rollover (Item : Monitor) return Natural;
   function Harm_Capacity (Item : Monitor; Intensity : Harm_Intensity)
                      return Capacity;
   function Is_Retired (Item : Monitor) return Boolean is
     (Trauma (Item) = Item.Trauma_Max);
   function Is_Deadish (Item : Monitor) return Boolean is
     (Harms (Item) (Fatal) > 0);

   procedure Add_Stress
     (Item : in out Monitor; Requested : Natural; Applied : out Natural)
   with Post =>
     (if Requested <= Item.Stress_Max - Stress (Item'Old) then
          Stress (Item) = Stress (Item'Old) + Requested
          and Applied = Requested
      else Stress (Item) = Item.Stress_Max
           and Applied = Item.Stress_Max - Stress (Item'Old))
     and Trauma (Item) = Trauma (Item'Old);

   procedure Clear_Stress
     (Item : in out Monitor; Requested : Natural; Applied : out Natural)
   with Post => Stress (Item) =
     (if Requested <= Stress (Item'Old)
      then Stress (Item'Old) - Requested else 0);

   procedure Add_Trauma (Item : in out Monitor; Error : out Operation_Error)
   with Post =>
     (if Trauma (Item'Old) = Item.Trauma_Max then
          Error = Duplicate and Trauma (Item) = Trauma (Item'Old)
      else Error = No_Error and Trauma (Item) = Trauma (Item'Old) + 1);

   procedure Remove_Trauma
     (Item : in out Monitor; Error : out Operation_Error)
   with Post =>
     (if Trauma (Item'Old) = 0 then
          Error = Duplicate and Trauma (Item) = 0
      else Error = No_Error and Trauma (Item) = Trauma (Item'Old) - 1);

   procedure Add_Harm
     (Item      : in out Monitor;
      Requested : Harm_Intensity;
      Landed    : out Harm_Intensity;
      Error     : out Operation_Error)
   with Post =>
     (if Error = No_Error then
          Landed >= Requested
          and Harms (Item) (Landed) = Harms (Item'Old) (Landed) + 1
      else Error = Slot_Full_Fatal
           and (for all I in Harm_Intensity range Requested .. Fatal =>
                  Harms (Item'Old) (I) = Harm_Capacity (Item, I)));

   procedure Remove_Harm
     (Item : in out Monitor; Intensity : Harm_Intensity;
      Error : out Operation_Error)
   with Post =>
     (if Harms (Item'Old) (Intensity) = 0 then
          Error = Duplicate and Harms (Item) = Harms (Item'Old)
      else Error = No_Error
           and Harms (Item) (Intensity) = Harms (Item'Old) (Intensity) - 1
           and (for all I in Harm_Intensity =>
                  (if I /= Intensity then Harms (Item) (I) = Harms (Item'Old) (I))));

   procedure Progress_Healing
     (Item : in out Monitor; Segments : Natural; Applied : out Natural)
   with Post =>
     (if Segments <= Item.Healing_Clock_Max - Healing_Clock (Item'Old) then
          Healing_Clock (Item) = Healing_Clock (Item'Old) + Segments
          and Applied = Segments
      else Healing_Clock (Item) = Item.Healing_Clock_Max
           and Applied = Item.Healing_Clock_Max - Healing_Clock (Item'Old));

   procedure Heal (Item : in out Monitor; Error : out Operation_Error)
   with Post =>
     (if Healing_Clock (Item'Old) < Item.Healing_Clock_Max then
          Error = Cannot_Heal and Harms (Item) = Harms (Item'Old)
      else Error = No_Error
           and Harms (Item) (Fatal) = Harms (Item'Old) (Fatal)
           and Harms (Item) (Severe) = 0
           and Harms (Item) (Moderate) <= Item.Moderate_Slots
           and Harms (Item) (Lesser) <= Item.Lesser_Slots);

private
   type Monitor
     (Stress_Max         : Capacity;
      Trauma_Max        : Capacity;
      Lesser_Slots      : Capacity;
      Moderate_Slots    : Capacity;
      Severe_Slots      : Capacity;
      Fatal_Slots       : Capacity;
      Healing_Clock_Max : Capacity) is record
      Stress_Value      : Natural := 0;
      Trauma_Count      : Natural := 0;
      Harm              : Harm_Counts := (others => 0);
      Heal_Value        : Natural := 0;
      Heal_Rollover     : Natural := 0;
   end record
   with Dynamic_Predicate =>
     Monitor.Stress_Value <= Monitor.Stress_Max
     and Monitor.Trauma_Count <= Monitor.Trauma_Max
     and Monitor.Heal_Value <= Monitor.Healing_Clock_Max
     and Monitor.Harm (Lesser) <= Monitor.Lesser_Slots
     and Monitor.Harm (Moderate) <= Monitor.Moderate_Slots
     and Monitor.Harm (Severe) <= Monitor.Severe_Slots
     and Monitor.Harm (Fatal) <= Monitor.Fatal_Slots;

   function Stress (Item : Monitor) return Natural is (Item.Stress_Value);
   function Trauma (Item : Monitor) return Natural is (Item.Trauma_Count);
   function Harms (Item : Monitor) return Harm_Counts is (Item.Harm);
   function Healing_Clock (Item : Monitor) return Natural is (Item.Heal_Value);
   function Healing_Rollover (Item : Monitor) return Natural is (Item.Heal_Rollover);
   function Harm_Capacity (Item : Monitor; Intensity : Harm_Intensity)
                      return Capacity is
     (case Intensity is
         when Lesser   => Item.Lesser_Slots,
         when Moderate => Item.Moderate_Slots,
         when Severe   => Item.Severe_Slots,
         when Fatal    => Item.Fatal_Slots);
end Paperclips_Core.Monitors;
