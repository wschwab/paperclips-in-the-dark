with AWS.Response;
with AWS.Status;

package Pitd_Callback is
   pragma SPARK_Mode (Off);
   procedure Configure
     (Static_Directory : String;
      Data_Directory   : String;
      Games_Directory  : String;
      Test_Hooks       : Boolean);

   function Handle (Request : AWS.Status.Data) return AWS.Response.Data;
end Pitd_Callback;
