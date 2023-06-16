import { readFileSync } from "fs";
import { CeramicClient } from "@ceramicnetwork/http-client";
import {
  createComposite,
  readEncodedComposite,
  writeEncodedComposite,
  writeEncodedCompositeRuntime,
} from "@composedb/devtools-node";
import { Composite } from "@composedb/devtools";
import shell from "shelljs";
import { fromString } from "uint8arrays/from-string";
import { DID } from "dids";
import { Ed25519Provider } from "key-did-provider-ed25519";
import { getResolver } from "key-did-resolver";
import ora from "ora";

const spinner = ora();
const ceramic = new CeramicClient("http://localhost:7007");

//Accessing your admin key to authenticate the session
const seed = shell.exec(
  `kubectl get secrets --namespace ceramic ceramic-admin -o json | jq -r '.data."private-key"' | base64 -d`
);
const key = fromString(seed.stdout, "base16");
const did = new DID({
  resolver: getResolver(),
  provider: new Ed25519Provider(key),
});

spinner.info("Authenticating ceramic admin");
await did.authenticate();
ceramic.did = did;
/**
 * @param {Ora} spinner - to provide progress status.
 * @return {Promise<void>} - return void when composite finishes deploying.
 */
// CourseDetail Composite
const CourseDetailsComposite = await createComposite(
  ceramic,
  "./composites/CourseDetails.graphql"
);

// Reviews Composite 
const ReviewsSchema = readFileSync(
  "./composites/Reviews.graphql",
  {
    encoding: "utf-8",
  }
).replace("$COURSE_DETAILS_ID", CourseDetailsComposite.modelIDs[0]);

const ReviewsComposite = await Composite.create({
  ceramic,
  schema: ReviewsSchema,
});

const CourseDetailxReviewsSchema = readFileSync(
  "./composites/CourseXReviews.graphql",
  {
    encoding: "utf-8",
  }
).replace('$REVIEW_ID', ReviewsComposite.modelIDs[1]).replace('$COURSE_DETAILS_ID', CourseDetailsComposite.modelIDs[0]);


const CourseDetailxReviewsComposite = await Composite.create({
  ceramic,
  schema: CourseDetailxReviewsSchema
});

const LiveStreamSchema = readFileSync(
  "./composites/LiveStream.graphql",
  {
    encoding: "utf-8",
  }
).replace("$COURSE_DETAILS_ID", CourseDetailsComposite.modelIDs[0]);

const LiveStreamComposite = await Composite.create({
  ceramic,
  schema: LiveStreamSchema
});

const BasicProfileComposite = await createComposite(
  ceramic,
  "./composites/BasicProfile.graphql"
);

const DaoDataComposite = await createComposite(
  ceramic,
  "./composites/DaoData.graphql"
);

const TimeStampSchema = readFileSync(
  "./composites/LiveStream.graphql",
  {
    encoding: "utf-8",
  }
).replace("$COURSE_DETAILS_ID", CourseDetailsComposite.modelIDs[0]);

const TimeStampComposite = await Composite.create({
  ceramic,
  schema: TimeStampSchema
});

const composite = Composite.from([
  CourseDetailsComposite,
  ReviewsComposite,
  CourseDetailxReviewsComposite,
  LiveStreamComposite,
  BasicProfileComposite,
  DaoDataComposite,
  TimeStampComposite
])

//Writing composites to local file
await writeEncodedComposite(composite, "./definition.json");
spinner.info("creating composite for runtime usage");
await writeEncodedCompositeRuntime(
  ceramic,
  "./definition.json",
  "./definition.js"
);
spinner.info("deploying composite");
const deployComposite = await readEncodedComposite(
  ceramic,
  "./definition.json"
);
const id = deployComposite.modelIDs;
spinner.info(`Deployed the following models: ${id}`);
await deployComposite.startIndexingOn(ceramic);
spinner.succeed("composite deployed & ready for use");
spinner.succeed("compiling composite into runtime composite");
shell.exec(`composedb composite:compile definition.json runtime-composite.json`);
spinner.succeed("establishing graphiql server");
shell.exec(`composedb graphql:server --graphiql runtime-composite.json --port=5005`)
