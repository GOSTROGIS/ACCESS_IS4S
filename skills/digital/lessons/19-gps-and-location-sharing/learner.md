---
title: Read a GPS fix and share a location
summary: Convert coordinates between degrees-minutes-seconds and decimal degrees, read how accurate your phone's location is, send a meeting point a crew can find, decide when to share your live location, and read a UTM easting and northing.
level: 2
time: 60 min
components: Use online tools and platforms; Use digital information; Apply safe and responsible practices online
---

# Read a GPS fix and share a location

Checked against Google Maps Help (computer and Android), Google Earth Help and Natural Resources Canada, 2026-11-08. Lesson 9, [Find and measure a site on a map](../09-maps-and-site-location/learner.html), comes first. The phone steps were checked for Android. On an iPhone, check the iPhone version of the same Google Maps Help pages.

## Why this matters on the job

A survey stake, a laydown yard on a logging road or a pipeline right-of-way often has no street address. The foreman sends coordinates, and you have to get them into your phone the right way. Coordinates come in more than one format, and one wrong sign puts you on the wrong side of the world. Your phone's blue dot also has an error you can see, and sharing your live location with a boss or a crew is a choice with privacy on the line.

## Key ideas

### Three ways to write the same point

Google Maps Help lists all three as formats you can type into the search box. Google Earth Pro can show all three.

| Format | Example: Vancouver City Hall |
|---|---|
| Decimal degrees (DD) | `49.2608, -123.1139` |
| Degrees, minutes, seconds (DMS) | `49°15'39"N 123°06'50"W` |
| Degrees and decimal minutes (DMM) | `49°15.650'N 123°06.833'W` |

One degree has 60 minutes ('), and one minute has 60 seconds ("). So one degree has 60 × 60 = 3600 seconds.

In decimal degrees, north and east are positive, south and west are negative. All of BC is north and west, so BC latitudes are positive and longitudes are negative. In DMS, the letters N and W do that job instead of the minus sign.

### Converting DMS to decimal degrees

Decimal degrees = degrees + minutes ÷ 60 + seconds ÷ 3600

BEDMAS: do both divisions first, then add. Then put a minus sign in front if the letter is W (or S).

### Worked example

Vancouver City Hall is at `49°15'39"N 123°06'50"W`.

Latitude: 49 + 15 ÷ 60 + 39 ÷ 3600 = 49 + 0.25 + 0.010833… = 49.260833… → **49.2608**

Longitude: 123 + 6 ÷ 60 + 50 ÷ 3600 = 123 + 0.1 + 0.013888… = 123.113888… → **123.1139**. The letter is W, so it is **−123.1139**.

In Google Maps: `49.2608, -123.1139`. Latitude first, a period for the decimal, a comma between the two numbers.

### How sure is your phone?

- On a phone, the **blue dot** shows where Google Maps thinks you are.
- When Google Maps is not sure, a **light blue circle** shows around the dot. It is an estimated uncertainty area, not a guaranteed boundary; the actual position can be outside it. The smaller the circle, the more certain the location.
- A grey dot, or no dot, means Maps cannot find you and is showing your last known place.
- Phone location accuracy varies with conditions; a displayed accuracy estimate is not a guaranteed maximum error. Inside buildings or underground it is often wrong. A location from cell towers alone can be off by a few thousand metres.

A GPS fix on a phone is good for finding a gate or a trailer. It is not a survey, and it does not show buried lines. Before anyone digs, contact BC 1 Call (Lesson 9).

### Getting coordinates from your phone

On an Android phone, open Google Maps and **touch and hold** a spot on the map that has no label. A red pin drops, and the coordinates show in the search box. You can copy them into a text message.

A good meeting-point message has three parts: the coordinates, a landmark a person can see, and the time. For example: `Meet 49.2608, -123.1139, City Hall front steps, 6:30.` Ask the person to read it back ([Communication 1](../../../communication/lessons/01-listen-and-repeat-back/learner.html)).

### Sharing your live location

Google Maps **Location sharing** sends your real-time location to people you pick. People you share with can see your name and photo, your device's recent location (even when you are not using Google apps), your battery level, and more depending on how you share.

- You choose how long: a set time, or until you turn it off.
- To stop on an Android phone: tap your profile picture, then **Location sharing**, tap the person, then **Stop**.
- A share link sent to someone without a Google account works for up to 24 hours.

Before you turn it on for a boss or a crew, ask: who sees it, for how long, and does it stop when my shift stops? Sharing a single meeting point is often all the job needs.

### UTM: eastings and northings in metres

Surveyors, forestry crews and engineers often use **UTM** coordinates instead of degrees. UTM splits the world into 60 zones, each 6 degrees of longitude wide, numbered from 1 at 180° going east. The Vancouver area is in **zone 10**, which runs from 126°W to 120°W with its centre line at 123°W.

- **Northing in BC (the northern hemisphere)**: grid distance in metres north of the equator. Southern-hemisphere UTM uses a different offset, so always record the zone and hemisphere.
- **Easting**: metres from a line set 500 000 m west of the zone's centre line. So the centre line itself has an easting of 500 000. Points west of it have eastings below 500 000, and points east of it have eastings above.

Google Earth Pro on a computer can show UTM: **Tools** > **Options** > **3D View**, then under **Show Lat/Long** choose **Universal Transverse Mercator**. On a Mac it is **Google Earth** > **Preferences** > **3D View**. The coordinates show in the lower right corner as you move the mouse.

## Practice

**Task 1** (level 1) Name the format of each: (a) `49°16.600'N 123°06.717'W` (b) `49.2767, -123.1119` (c) `49°16'36"N 123°06'43"W`

(a) ______  (b) ______  (c) ______

**Task 2** (level 2) Convert Vancouver City Hall, `49°15'39"N 123°06'50"W`, to decimal degrees without looking at the worked example. Show the divisions first, then the additions. Round to 4 decimal places. Type your answer into Google Maps to check it lands on City Hall.

______________________________________________________________

**Task 3** (level 2) BC Place stadium is at `49°16'36"N 123°06'43"W`. Convert it to decimal degrees to 4 places. Then type the DMS version straight into the Google Maps search box. Do both land in the same place? Which is farther north, BC Place or City Hall? How can you tell from the numbers alone?

______________________________________________________________

**Task 4** (level 2) A co-worker types `49.2767, 123.1119` into Google Maps for BC Place. What went wrong, and roughly where in the world does the pin land?

______________________________________________________________

**Task 5** (level 1) On your phone, open Google Maps and find your location. Look at the blue dot inside the classroom, then (if you can) by a window or outside. Write what you see around the dot each time and what it tells you.

______________________________________________________________

**Task 6** (level 2) Touch and hold a spot near the training site's entrance to drop a pin. Copy the coordinates. Write a meeting-point text for a new crew member with coordinates, a landmark and a time. Send it to your partner (or read it aloud), and have them read it back and find it on their own map.

______________________________________________________________

**Task 7** (level 2) Your new foreman says: "Turn on location sharing with me, until you turn it off, so I know where everyone is." Write what the foreman would be able to see, two questions you would ask before saying yes, and how you would stop sharing later.

______________________________________________________________

**Task 8** (level 3) In Google Earth Pro, set the coordinate display to UTM. Put the mouse on Vancouver City Hall. Write the zone, the easting and the northing. Is the easting more or less than 500 000? Explain why using City Hall's longitude.

______________________________________________________________

## Check yourself

1. How many seconds are in one degree?
2. In decimal degrees, why is the longitude of a BC site negative?
3. What does a large light blue circle around your blue dot mean?
4. What three things make a good meeting-point text?
5. In UTM, what does a northing measure?
