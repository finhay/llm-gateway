import pem from "./detectors/pem.js";
import ssh from "./detectors/ssh.js";
import databaseUrl from "./detectors/databaseUrl.js";
import aws from "./detectors/aws.js";
import github from "./detectors/github.js";
import gitlab from "./detectors/gitlab.js";
import openai from "./detectors/openai.js";
import anthropic from "./detectors/anthropic.js";
import google from "./detectors/google.js";
import slack from "./detectors/slack.js";
import jwt from "./detectors/jwt.js";
import entropy from "./detectors/entropy.js";

export const DETECTORS = [
  pem,
  ssh,
  databaseUrl,
  aws,
  github,
  gitlab,
  openai,
  anthropic,
  google,
  slack,
  jwt,
  entropy,
];
