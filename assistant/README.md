# ACCESS assistant models

The [assistant profile](profile.json) defines ACCESS Developer Guide. To create and run its local model from this checkout, use

```powershell
ollama create guide-app-access-is4s:v1 -f assistant/Modelfile
ollama run guide-app-access-is4s:v1
```

For source lookup and available app tools, open the shared developer assistant from this checkout.

Additional profiles in this repository

- [ACCESS Learning Guide](student/profile.json) uses `guide-student:v1`. Its Modelfile is in the same folder.
