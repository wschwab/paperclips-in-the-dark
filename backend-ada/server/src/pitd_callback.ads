with AWS.Response;
with AWS.Status;

package Pitd_Callback is
   procedure Configure
     (Static_Directory : String;
      Data_Directory   : String);

   function Handle (Request : AWS.Status.Data) return AWS.Response.Data;
end Pitd_Callback;
