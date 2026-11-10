const { DevelopmentPlaybackBuildConfig } = require('./config/development-playback.cjs');
module.exports = ({ config }) => new DevelopmentPlaybackBuildConfig().apply(config, process.env);
