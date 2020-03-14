YANG
====

pyang (Python YANG) allows you to process data models in an easier to read format. `pyang -f tree` will show the output in a tree format.

YANG is an IETF standard for modelling language to write data models for computer programming, which can be used to describe anything. Descriptive way of describing a network. Each parent is called a container (nothing to do with Docker). Each child item/attribute/element in YANG is called a leaf (not an edge switch in a topology). In YANG, model and module are loosely interchangeable terms. The network engineer does not need to create the YANG model, the vendor (IETF mostly) does and we just make use of it.

Data Models are an intuitive way of understanding an object. A group of people each have height, hair colour, eye colour, ages, genders, skin tone, etc. You can find a person using these descriptions.

OpenConfig / IETF / Native - a consortium of vendors come together to create an openconfig model, IETF is the standard and all vendors have their own native models.

Official place for YANG models - https://github.com/YangModels/yang
