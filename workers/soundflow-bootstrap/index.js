function readPayload(input) {
  if (typeof input === "string") {
    return JSON.parse(input);
  }
  return input || {};
}

function handleSetFader(step) {
  const track = step.track || "Unknown Track";
  const valueDb = typeof step.value_db === "number" ? step.value_db : 0;
  if (typeof sf !== "undefined" && sf.log) {
    sf.log(`AI Audio Studio setFader ${track} ${valueDb}dB`);
  }
  return {
    action: "setFader",
    track,
    value_db: valueDb,
    ok: true,
  };
}

function handleComment(step) {
  const comment = step.comment || "No comment provided";
  if (typeof sf !== "undefined" && sf.log) {
    sf.log(`AI Audio Studio comment: ${comment}`);
  }
  return {
    action: "comment",
    comment,
    ok: true,
  };
}

function run(input) {
  const payload = readPayload(input);
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  return {
    metadata: payload.metadata || {},
    results: steps.map((step) => {
      if (step.action === "setFader") return handleSetFader(step);
      return handleComment(step);
    }),
  };
}

module.exports = {
  run,
};
