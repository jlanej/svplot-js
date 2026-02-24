## Test Data Attribution

The test data in this directory originates from the [**samplot**](https://github.com/ryanlayer/samplot) project by Ryan Layer and contributors. All credit for collecting, curating, and providing these test alignments belongs to the samplot team.

> **Citation:** Belyeu, J.R., Nicholas, T.J., Pedersen, B.S. et al. SV-plaudit: A cloud-based framework for manually curating thousands of structural variants. *GigaScience*, 7(7), 2018.
>
> **Repository:** <https://github.com/ryanlayer/samplot>

## Contents

This directory contains data and scripts for the download of that data. Alignments are from Genome in a Bottle public resources.
Running the `subset_alignments.sh` script will download the data available in these alignment files.
These alignments only includes reads from the regions included in the `examples_padded.bed` file.
The regions of interest (SVs and one normal region) are indicated in the `examples.bed` file.
