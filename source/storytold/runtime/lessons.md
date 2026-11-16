# Storytold application labs

## Mark up a training image in PhotoCraft

Practise digital skills, communication and problem solving. Allow 25 minutes.

Use a supplied training image that is cleared for classroom use. Open it in
PhotoCraft using **Open**. Describe one detail a partner should notice, then
add a transparent layer in the Layers panel and mark that detail with the
Brush. Toggle the layer off and back on to compare the original and annotated
views.

1. Choose **File → Save** to save the layered PSD.
2. Choose **File → Export → Quick Export as PNG** to create a viewing copy.
3. Reopen the PSD through **File → Open**. Toggle the markup layer to check
   that both layers are editable and the starting image is intact.
4. Open the PNG in an image viewer and compare the detail and image dimensions
   with the PSD. Ask a partner to name the detail without hearing your brief.

Hand in the PSD, the PNG and one sentence explaining what the mark helps the
reader see. Credit the original training image when required.

## Revise and share a bracket drawing in CADCraft

Practise numeracy, digital skills and communication. Allow 30 minutes.

Use CADCraft's native command-line application in a new working directory.
Create its built-in bracket sample with `cadcraft-cli sample bracket starter.dwg`
and use `cadcraft-cli info starter.dwg` to record the original line and circle
counts. These commands use the sample's drawing units.

```sh
cadcraft-cli run starter.dwg \
  --cmd 'line {"points":[[22,0],[30,8]]}' \
  --cmd 'circle {"center":[25,5],"radius":2}' \
  --cmd undo --cmd redo --save revised.dwg
cadcraft-cli info revised.dwg
cadcraft-cli convert revised.dwg revised.pdf
```

The reopened DWG should have one more line and one more circle. Calculate the
added line's length from its coordinate differences and the circle's diameter
from its radius. Open the PDF and ask a partner to point to the two changes.
Share the drawing and viewing copy with a note naming the units, the two
measurements and the version that can be edited.

For instructors, the expected line length is √128, about 11.31 drawing
units. The expected circle diameter is 4 drawing units. Check that the learner
retained the source file and can reopen the independently named revision.
