PowerShell
==========

For Loop
--------

https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_foreach?view=powershell-7.2

.. code-block:: powershell

  $letterArray = "a","b","c","d"
  foreach ($letter in $letterArray)
  {
    Write-Host $letter
  }

Removing Files
--------------

https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.management/remove-item?view=powershell-7.2

.. code-block:: powershell

  Remove-Item C:\Test\*.*

Renaming Files
--------------

https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.management/rename-item?view=powershell-7.2

.. code-block:: powershell

  Rename-Item -Path "c:\logfiles\daily_file.txt" -NewName "monday_file.txt"

Get Date
--------

https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/get-date?view=powershell-7.2

.. code-block:: powershell

  $date = get-date -format yyyymmdd

Send Email
----------

Save the PSCredential in a file:

https://stackoverflow.com/questions/40029235/save-pscredential-in-the-file

.. code-block:: powershell

  $credential = Get-Credential
  $credential | Export-CliXml -Path 'C:\My\Path\cred.xml'
  $credential = Import-CliXml -Path 'C:\My\Path\cred.xml'

https://www.pdq.com/blog/powershell-send-mailmessage-gmail/

.. code-block:: powershell

  ##############################################################################
  $From = "YourEmail@gmail.com"
  $To = "AnotherEmail@YourDomain.com"
  $Cc = "YourBoss@YourDomain.com"
  $Attachment = "C:\temp\Some random file.txt"
  $Subject = "Email Subject"
  $Body = "Insert body text here"
  $SMTPServer = "smtp.gmail.com"
  $SMTPPort = "587"
  Send-MailMessage -From $From -to $To -Cc $Cc -Subject $Subject `
  -Body $Body -SmtpServer $SMTPServer -port $SMTPPort -UseSsl `
  -Credential (Get-Credential) -Attachments $Attachment
  ##############################################################################

Random
------

.. code-block:: powershell

  # If error?
  if ($error.count -ne 0) {
      Write-Host -ForegroundColor Red "Uh-oh! $MyVar."
      Write-Host -ForegroundColor White -BackgroundColor Black "The error was:"
      Write-Host $error[0]
      Write-Host -ForegroundColor White -BackgroundColor Black "Oh no!"
      return
  }

  # Continue past errors
  $ErrorActionPreference = 'SilentlyContinue'

Multipart/form-data
-------------------

https://get-powershellblog.blogspot.com/2017/09/multipartform-data-support-for-invoke.html

.. code-block:: powershell

  # Initiate multipartContent
  $multipartContent = [System.Net.Http.MultipartFormDataContent]::new()

  $stringHeader = [System.Net.Http.Headers.ContentDispositionHeaderValue]::new("form-data")
  $stringHeader.Name = "GivenName"
  $StringContent = [System.Net.Http.StringContent]::new("Mark")
  $StringContent.Headers.ContentDisposition = $stringHeader
  $multipartContent.Add($stringContent)

  $stringHeader = [System.Net.Http.Headers.ContentDispositionHeaderValue]::new("form-data")
  $stringHeader.Name = "Surname"
  $StringContent = [System.Net.Http.StringContent]::new("Kraus")
  $StringContent.Headers.ContentDisposition = $stringHeader
  $multipartContent.Add($stringContent)

  $multipartFile = 'C:\pics\profile.png'
  $FileStream = [System.IO.FileStream]::new($multipartFile, [System.IO.FileMode]::Open)
  $fileHeader = [System.Net.Http.Headers.ContentDispositionHeaderValue]::new("form-data")
  $fileHeader.Name = "ProfilePic"
  $fileHeader.FileName = 'profile.png'
  $fileContent = [System.Net.Http.StreamContent]::new($FileStream)
  $fileContent.Headers.ContentDisposition = $fileHeader
  $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("image/png")
  $multipartContent.Add($fileContent)

  $multipartFile = 'C:\music\LinkinPark_CrawlingInMySkin.midi'
  $FileStream = [System.IO.FileStream]::new($multipartFile, [System.IO.FileMode]::Open)
  $fileHeader = [System.Net.Http.Headers.ContentDispositionHeaderValue]::new("form-data")
  $fileHeader.Name = "BackGroundMusic"
  $fileHeader.FileName = 'LinkinPark_CrawlingInMySkin.midi'
  $fileContent = [System.Net.Http.StreamContent]::new($FileStream)
  $fileContent.Headers.ContentDisposition = $fileHeader
  $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("audio/midi")
  $multipartContent.Add($fileContent)

  Invoke-RestMethod -Uri $uri -Body $multipartContent -Method 'POST'
