param([string]$HandleHex)
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class RegionCheck {
 [DllImport("user32.dll")] public static extern int GetWindowRgn(IntPtr h, IntPtr r);
 [DllImport("gdi32.dll")] public static extern IntPtr CreateRectRgn(int a,int b,int c,int d);
 [DllImport("gdi32.dll")] public static extern int GetRgnBox(IntPtr r,out RECT box);
 [DllImport("gdi32.dll")] public static extern bool PtInRegion(IntPtr r,int x,int y);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT box);
 [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr h);
 public struct RECT { public int left,top,right,bottom; }
}
'@
$bytes = [byte[]]::new($HandleHex.Length / 2)
for($i=0;$i -lt $bytes.Length;$i++){ $bytes[$i]=[Convert]::ToByte($HandleHex.Substring($i*2,2),16) }
$h=[IntPtr]::new([BitConverter]::ToInt64($bytes,0))
$r=[RegionCheck]::CreateRectRgn(0,0,0,0)
$kind=[RegionCheck]::GetWindowRgn($h,$r)
$box=New-Object RegionCheck+RECT
[void][RegionCheck]::GetRgnBox($r,[ref]$box)
$inside=[RegionCheck]::PtInRegion($r,10,23)
$outside=[RegionCheck]::PtInRegion($r,10,24)
if($kind -eq 0 -or $box.bottom -ne 24 -or $box.right -ne 650 -or !$inside -or $outside){throw "Wrong native hit region $($box|ConvertTo-Json -Compress)"}
@{kind=$kind;region=$box;insideY23=$inside;outsideY24=$outside} | ConvertTo-Json -Depth 4 | Set-Content C:/downloads/windows-region.json
Add-Type -AssemblyName System.Drawing
$w=New-Object RegionCheck+RECT
[void][RegionCheck]::GetWindowRect($h,[ref]$w)
$bmp=New-Object System.Drawing.Bitmap 650,80
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($w.left,$w.top,0,0,$bmp.Size)
$bmp.Save('C:/downloads/windows-desktop-collapsed.png',[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose();$bmp.Dispose();[void][RegionCheck]::DeleteObject($r)
Write-Output 'NATIVE REGION PASS: drawing/hit width650 height24; y23 inside; y24 outside.'
