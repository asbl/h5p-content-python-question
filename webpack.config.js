const path = require('path');
const sass = require('sass');
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const TerserPlugin = require('terser-webpack-plugin');

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = (nodeEnv === 'production');

module.exports = {
  mode: nodeEnv,
  optimization: {
    minimize: isProd,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress:{
            drop_console: false,
          }
        }
      }),
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: 'h5p-python-question.css'
    })
  ],
  entry: {
    dist: './src/entries/h5p-python-question.js'
  },
  output: {
    filename: 'h5p-python-question.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  target: ['web', 'es5'], // IE11
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'babel-loader'
      },
      {
        test: /\.py$/,
        include: path.join(__dirname, 'src/scripts/runtime/assets'),
        type: 'asset/source'
      },
      {
        test: /\.(s[ac]ss|css)$/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader,
            options: {
              publicPath: ''
            }
          },
          { loader: "css-loader" },
          {
            loader: "sass-loader",
            options: {
              implementation: sass,
              api: 'modern'
            }
          }
        ]
      },
      {
        test: /\.svg|\.jpg|\.png$/,
        include: path.join(__dirname, 'src/images'),
        type: 'asset/resource'
      },
      {
        test: /\.woff$/,
        include: path.join(__dirname, 'src/fonts'),
        type: 'asset/resource'
      }
    ]
  },
  resolve: {
    alias: {
      // Sibling-repo shared code. Centralizing the path here means a
      // LibCodeTools version-folder bump only needs updating in one place
      // instead of in every importing file.
      '@libcodetools': path.resolve(__dirname, '../H5P.LibCodeTools-6.0/src')
    }
  },
  stats: {
    colors: true
  },
  devtool: (isProd) ? undefined : 'eval-cheap-module-source-map'
};
