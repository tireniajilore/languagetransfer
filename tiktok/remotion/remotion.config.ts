import {Config} from '@remotion/cli/config';
import {enableTailwind} from '@remotion/tailwind';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setConcurrency(4);

// Route Remotion's webpack through Tailwind so design tokens + utility
// classes are available in every scene/component.
Config.overrideWebpackConfig(enableTailwind);
