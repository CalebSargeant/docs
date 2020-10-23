PowerShell
==========

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
