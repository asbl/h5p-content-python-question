const path = require('path');

/**
 * Builds the tkinter smoke-test bundle (real service code, no H5P host).
 * The bundle lands in tools/browser-regression/build so it never becomes
 * part of the shipped library.
 */
module.exports = {
  mode: process.env.NODE_ENV || 'production',
  entry: {
    'tkinter-smoke': './src/entries/tkinter-smoke.js',
  },
  output: {
    filename: 'tkinter-smoke.js',
    path: path.resolve(__dirname, 'tools/browser-regression/build'),
    clean: true,
  },
  target: ['web', 'es5'],
  resolve: {
    alias: {
      '@libcodetools': path.resolve(__dirname, '../H5P.LibCodeTools-6.0/src')
    }
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
      },
      {
        test: /\.py$/,
        include: path.join(__dirname, 'src/scripts/runtime/assets'),
        type: 'asset/source',
      },
    ],
  },
};
