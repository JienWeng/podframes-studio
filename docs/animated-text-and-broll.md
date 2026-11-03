# Animated text and video B-roll

In Studio → B-roll & captions, click a text-template card: **Comic burst**, **Speech bubble**, or **Wish ribbon**; replace the words, then drag the timing handles. These original vector templates use editable text rather than flattened text baked into an image. The Graphics toggle hides them without deleting your edits. Spoken captions remain independently timed to the script.

The templates bundle vector artwork, colors, type, entry motion, a gentle rotation and an exit. Both the live editor and HyperFrames export use the same SVG artwork. Keep copy short for a readable two-line graphic. These are original designs, not extracted TV or CapCut assets.

This follows the layer/keyframe approach described in [CapCut’s editing guide](https://www.capcut.com/resource/how-to-use-capcut): footage below, decorative graphics above, and captions above those. Position, scale and rotation change over time. The exported animation is driven by the timeline, so seeking and rendering do not depend on a CSS animation starting at the right moment.

## AI video cutaways

Add a footage beat, write the desired shot, and choose **Generate AI video**. The fixed provider is [fal LTX-2.3 text-to-video](https://fal.ai/models/fal-ai/ltx-2.3/text-to-video/api): six seconds, 1080p, 25 fps, matching portrait/landscape orientation, with audio disabled. Set `FAL_API_KEY` in the server/worker `.env` and restart the service. This uses fal API billing, separate from Fish website credits or a HeyGen subscription.

A useful prompt describes a concrete shot, not the whole joke: “Handheld close-up of an exhausted office worker staring at five laptops on a cluttered desk, natural fluorescent light, subtle slow push-in, documentary footage, no words, no logos.” Use a short cutaway around the punchline, with dialogue and captions continuing underneath. For authentic reactions, upload your own footage or import a direct HTTPS MP4/WebM link instead.

The provider request ID is saved before polling. Reopening or polling a saved request does not create another paid video. If submission times out before a request ID returns, check fal history before starting another request. Generated footage is downloaded and muted through the same import path as uploaded footage. Enabling B-roll is required for footage to appear; the opening title has its own toggle.
