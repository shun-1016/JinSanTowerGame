# JinSan Tower Game v17.10

v17.10 fixes camera direction while retaining v17.9 standby input behavior.

- Camera remains fixed until the settled tower top reaches 45% of the stage.
- After the threshold, cameraY is allowed to become negative.
- The tower top is maintained around the 45% line as the tower grows.
- Negative cameraY moves the ground downward on screen, so the base gradually disappears instead of leaving a gap underneath it.
- Falling/current pieces are excluded from camera-height calculation.
- Existing v17.9 horizontal-only standby-piece input behavior is retained.

Existing assets and unchanged project files are reused. Only changed files are included.
